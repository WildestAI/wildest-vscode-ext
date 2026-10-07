import * as vscode from 'vscode';
import * as path from 'path';
import { GitCommandCancelledError, GitService } from '../services/GitService';
import { GitCommit, GitGraphNode } from '../utils/types';
import { GitHistoryCache } from '../services/GitHistoryCache';
import { CliCancelledError } from '../services/CliService';

export interface HistoryPerformanceSnapshot {
	source: 'cache' | 'git' | 'none';
	repositoryDiscoveryMs: number;
	cacheLookupMs: number;
	gitFetchMs: number | undefined;
	graphBuildMs: number;
	/** Elapsed time until the cached graph has rendered in the webview, when available. */
	firstUsableGraphMs: number | undefined;
	totalMs: number;
}

export class HistoryViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'wildestai.historyView';
	private _view?: vscode.WebviewView;
	private _currentRepoRoot?: string;
	private readonly _repositoryWatchers = new Map<string, vscode.Disposable[]>();
	private readonly _repositoryRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private _refreshPromise?: Promise<void>;
	private _refreshCancellation?: vscode.CancellationTokenSource;
	private _activeForceRefresh = false;
	private _pendingForceRefresh = false;
	private _nextCachedGraphPaintId = 0;
	private _nextHistoryLoadId = 0;
	private _lastCompletedPerformanceSnapshotLoadId = 0;
	private readonly _cachedGraphPaints = new Map<number, { loadId: number; startedAt: number; measuredMs?: number }>();
	private _lastPerformanceSnapshot: HistoryPerformanceSnapshot = {
		source: 'none', repositoryDiscoveryMs: 0, cacheLookupMs: 0, gitFetchMs: undefined, graphBuildMs: 0, firstUsableGraphMs: undefined, totalMs: 0,
	};

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext,
		private readonly _onCommitClicked: (commitHash: string, repoPath: string) => Promise<void>
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// Initialize webview HTML shell
		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, '');

		// Set up message handling from webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'commitClicked' && message.commitHash && message.repoPath) {
				await this._onCommitClicked(message.commitHash, message.repoPath);
			} else if (message.command === 'refresh') {
				await this.refresh(true);
			} else if (message.command === 'cachedGraphRendered' && typeof message.cachePaintId === 'number') {
				this.recordCachedGraphFirstPaint(message.cachePaintId);
			}
		});

		const cancellationSubscription = _token.onCancellationRequested(() => this.cancelRefresh());
		webviewView.onDidDispose(() => {
			cancellationSubscription.dispose();
			this.cancelRefresh();
			if (this._view === webviewView) {
				this._view = undefined;
			}
		});
		webviewView.onDidChangeVisibility(() => {
			if (!webviewView.visible) {
				this.cancelRefresh();
				return;
			}
			this.refreshWhenVisible(webviewView);
		});

		this.refreshWhenVisible(webviewView);
	}

	/** Cancel in-flight history work that can no longer update the visible view. */
	public cancelRefresh(): void {
		this._refreshCancellation?.cancel();
	}

	/** Release repository watchers and pending refreshes when the extension unloads. */
	public dispose(): void {
		for (const disposables of this._repositoryWatchers.values()) {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		}
		this._repositoryWatchers.clear();
		for (const timer of this._repositoryRefreshTimers.values()) {
			clearTimeout(timer);
		}
		this._repositoryRefreshTimers.clear();
		this.cancelRefresh();
	}

	/**
	 * Observe the repository state which makes a warm history result stale.
	 *
	 * Worktree saves are watched from the repository root. Git's own metadata is
	 * watched separately because VS Code commonly excludes `.git` from broad
	 * workspace file watchers. Debouncing turns a save, add, or commit burst
	 * into one cache invalidation and one fresh history read.
	 */
	private ensureRepositoryWatcher(repoRoot: string): void {
		if (this._repositoryWatchers.has(repoRoot)) {
			return;
		}
		const onChange = () => this.handleRepositoryChange(repoRoot);
		const repositoryUri = vscode.Uri.file(repoRoot);
		const gitUri = vscode.Uri.joinPath(repositoryUri, '.git');
		const patterns = [
			new vscode.RelativePattern(repositoryUri, '**/*'),
			new vscode.RelativePattern(gitUri, 'HEAD'),
			new vscode.RelativePattern(gitUri, 'index'),
			new vscode.RelativePattern(gitUri, 'packed-refs'),
			new vscode.RelativePattern(gitUri, 'refs/**'),
		];
		const watchers = patterns.flatMap(pattern => {
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			return [
				watcher,
				watcher.onDidCreate(onChange),
				watcher.onDidChange(onChange),
				watcher.onDidDelete(onChange),
			];
		});
		this._repositoryWatchers.set(repoRoot, watchers);
	}

	private handleRepositoryChange(repoRoot: string): void {
		GitHistoryCache.invalidate(repoRoot);
		const previousTimer = this._repositoryRefreshTimers.get(repoRoot);
		if (previousTimer) {
			clearTimeout(previousTimer);
		}
		const timer = setTimeout(() => {
			this._repositoryRefreshTimers.delete(repoRoot);
			if (this._currentRepoRoot === repoRoot && this._view?.visible) {
				void this.refresh(true);
			}
		}, 200);
		this._repositoryRefreshTimers.set(repoRoot, timer);
	}

	/** Start an initial load only after a cancelled load for an earlier view has settled. */
	private refreshWhenVisible(webviewView: vscode.WebviewView): void {
		const activeRefresh = this._refreshPromise;
		if (activeRefresh) {
			void activeRefresh.finally(() => {
				if (this._view === webviewView && webviewView.visible) {
					void this.refresh(false);
				}
			});
			return;
		}

		if (this._view === webviewView && webviewView.visible) {
			void this.refresh(false);
		}
	}

	public async refresh(forceRefresh = true): Promise<void> {
		if (this._refreshPromise) {
			// A forced refresh arriving while a cache-only load is in flight still needs one
			// fresh pass. Concurrent forced refreshes share the active fresh pass.
			if (forceRefresh && !this._activeForceRefresh) {
				this._pendingForceRefresh = true;
			}
			return this._refreshPromise;
		}

		this._activeForceRefresh = forceRefresh;
		const cancellation = new vscode.CancellationTokenSource();
		this._refreshCancellation = cancellation;
		this._refreshPromise = this.runRefreshes(forceRefresh, cancellation.token);
		try {
			await this._refreshPromise;
		} finally {
			if (this._refreshCancellation === cancellation) {
				this._refreshCancellation = undefined;
			}
			cancellation.dispose();
			this._refreshPromise = undefined;
			this._activeForceRefresh = false;
		}
	}

	/**
	 * Timing from the most recent history load. This is deliberately local-only:
	 * it contains no repository paths, commit data, or telemetry payload.
	 */
	public getLastPerformanceSnapshot(): HistoryPerformanceSnapshot {
		return { ...this._lastPerformanceSnapshot };
	}

	private async runRefreshes(forceRefresh: boolean, cancellationToken: vscode.CancellationToken): Promise<void> {
		do {
			if (cancellationToken.isCancellationRequested) {
				return;
			}
			this._pendingForceRefresh = false;
			this._activeForceRefresh = forceRefresh;
			try {
				await this.loadGitHistory(forceRefresh, cancellationToken);
			} catch (error) {
				if (error instanceof CliCancelledError || error instanceof GitCommandCancelledError) {
					return;
				}
				if (error instanceof Error && error.message.includes('Timeout waiting for Git')) {
					// If we hit a timeout, schedule another refresh attempt.
					setTimeout(() => void this.refresh(forceRefresh), 2000);
				} else {
					throw error;
				}
			}
			forceRefresh = this._pendingForceRefresh;
		} while (forceRefresh);
	}

	private async loadGitHistory(forceRefresh: boolean, cancellationToken?: vscode.CancellationToken): Promise<void> {
		const view = this._view;
		if (!view) {
			return;
		}
		if (cancellationToken?.isCancellationRequested) {
			return;
		}
		const loadId = ++this._nextHistoryLoadId;
		const startedAt = performance.now();
		let repositoryDiscoveryMs = 0;
		let cacheLookupMs = 0;
		let gitFetchMs: number | undefined;
		let graphBuildMs = 0;
		let firstUsableGraphMs: number | undefined;
		let source: HistoryPerformanceSnapshot['source'] = 'none';

		// Show loading state immediately at the start
		view.webview.postMessage({ type: 'loading', state: true });

		let hasUsableHistory = false;
		try {
			const repositoryDiscoveryStartedAt = performance.now();
			const repositories = await (async () => {
				try {
					return await GitService.getRepositories();
				} finally {
					repositoryDiscoveryMs = performance.now() - repositoryDiscoveryStartedAt;
				}
			})();
			if (this._view !== view || cancellationToken?.isCancellationRequested) {
				return;
			}
			if (repositories.length === 0) {
				view.webview.postMessage({ type: 'empty' });
				return;
			}

			const repoRoot = repositories[0].repoRoot;
			this._currentRepoRoot = repoRoot;
			this.ensureRepositoryWatcher(repoRoot);
			const repoName = path.basename(repoRoot);

			// Ensure HTML shell is set (idempotent)
			view.webview.html = this.getHtmlForWebview(view.webview, repoName);

			// Check cache and show cached data immediately if available
			const cacheLookupStartedAt = performance.now();
			const cached = GitHistoryCache.getCached(repoRoot);
			cacheLookupMs = performance.now() - cacheLookupStartedAt;
			if (cached) {
				const graphBuildStartedAt = performance.now();
				const graphData = this.buildGraphData(cached.commits, cached.graphLines);
				graphBuildMs += performance.now() - graphBuildStartedAt;
				const cachePaintId = ++this._nextCachedGraphPaintId;
				this._cachedGraphPaints.set(cachePaintId, { loadId, startedAt });
				view.webview.postMessage({
					type: 'commits',
					commits: graphData.map(node => ({
						...node.commit,
						color: node.color
					})),
					graphLines: cached.graphLines,
					repoPath: repoRoot,
					repoName,
					cachePaintId,
				});
				hasUsableHistory = true;
				source = 'cache';
				if (!forceRefresh) {
					return;
				}
			}

			const gitFetchStartedAt = performance.now();
			const { commits, graphLines } = await (async () => {
				try {
					return await this.getGitCommits(repoRoot, cancellationToken);
				} finally {
					gitFetchMs = performance.now() - gitFetchStartedAt;
				}
			})();
			if (this._view !== view || cancellationToken?.isCancellationRequested) {
				return;
			}

			const graphBuildStartedAt = performance.now();
			const graphData = this.buildGraphData(commits, graphLines);
			graphBuildMs += performance.now() - graphBuildStartedAt;
			view.webview.postMessage({
				type: 'commits',
				commits: graphData.map(node => ({
					...node.commit,
					color: node.color
				})),
				graphLines,
				repoPath: repoRoot,
				repoName
			});
			source = 'git';
		} catch (error: any) {
			if (error instanceof CliCancelledError || error instanceof GitCommandCancelledError) {
				throw error;
			}
			if (this._view !== view || cancellationToken?.isCancellationRequested) {
				return;
			}
			if (hasUsableHistory) {
				void vscode.window.showWarningMessage('WildestAI could not refresh Git history. Showing the last cached result.');
			} else {
				view.webview.postMessage({ type: 'error', message: error.message ?? String(error) });
			}

			if (error instanceof Error && error.message.includes('Timeout waiting for Git')) {
				throw error;
			}
		} finally {
			const renderedCachePaint = [...this._cachedGraphPaints.entries()]
				.find(([, paint]) => paint.loadId === loadId && paint.measuredMs !== undefined);
			if (renderedCachePaint) {
				firstUsableGraphMs = renderedCachePaint[1].measuredMs;
				this._cachedGraphPaints.delete(renderedCachePaint[0]);
			}
			if (this._view === view) {
				this._lastPerformanceSnapshot = {
					source,
					repositoryDiscoveryMs,
					cacheLookupMs,
					gitFetchMs,
					graphBuildMs,
					firstUsableGraphMs,
					totalMs: performance.now() - startedAt,
				};
				this._lastCompletedPerformanceSnapshotLoadId = loadId;
				// Ensure loading state is turned off in case of unexpected errors.
				view.webview.postMessage({ type: 'loading', state: false });
			}
		}
	}


	private recordCachedGraphFirstPaint(cachePaintId: number): void {
		const pendingPaint = this._cachedGraphPaints.get(cachePaintId);
		if (!pendingPaint) {
			return;
		}

		pendingPaint.measuredMs = performance.now() - pendingPaint.startedAt;
		if (pendingPaint.loadId < this._lastCompletedPerformanceSnapshotLoadId) {
			this._cachedGraphPaints.delete(cachePaintId);
			return;
		}
		if (pendingPaint.loadId !== this._lastCompletedPerformanceSnapshotLoadId) {
			return;
		}

		this._cachedGraphPaints.delete(cachePaintId);
		this._lastPerformanceSnapshot = {
			...this._lastPerformanceSnapshot,
			firstUsableGraphMs: pendingPaint.measuredMs,
		};
	}

	private async getGitCommits(
		repoPath: string,
		cancellationToken?: vscode.CancellationToken,
	): Promise<{ commits: GitCommit[], graphLines: string[] }> {
		try {
			// Always fetch fresh data
			const args = ['log', '--graph', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'];
			const stdout = await GitService.runGit(repoPath, args, cancellationToken);
			const result = this.parseGitGraphLog(stdout);

			// Update cache with fresh data
			GitHistoryCache.update(repoPath, result.commits, result.graphLines);

			return result;
		} catch (error: any) {
			if (error instanceof CliCancelledError || error instanceof GitCommandCancelledError) {
				throw error;
			}
			throw new Error(`Failed to get git history: ${error.message}`);
		}
	}

	private parseGitGraphLog(gitOutput: string): { commits: GitCommit[], graphLines: string[] } {
		const commits: GitCommit[] = [];
		const graphLines: string[] = [];
		const lines = gitOutput.split('\n');

		for (const line of lines) {
			// Extract graph part (everything before the commit hash)
			const commitMatch = line.match(/^(.*?)([a-f0-9]{40}\|.*)/);
			if (commitMatch) {
				const [, graphPart, commitPart] = commitMatch;
				graphLines.push(graphPart);

				// Parse commit data
				const parts = commitPart.split('|');
				if (parts.length >= 7) {
					// Take first 5 tokens as fixed fields (to avoid issues if subject contains '|')
					const [hash, shortHash, author, email, date, ...rest] = parts;
					// Take last two elements as parents and refs
					const refs = rest.pop() || '';
					const parents = rest.pop() || '';
					// Join remaining elements back into subject (in case subject contained '|')
					const subject = rest.join('|');

					commits.push({
						hash: hash.trim(),
						shortHash: shortHash.trim(),
						author: author.trim(),
						email: email.trim(),
						date: new Date(date.trim()),
						message: subject.trim(),
						subject: subject.trim(),
						parents: parents ? parents.trim().split(' ').filter(p => p) : [],
						refs: refs ? refs.trim().split(', ').filter(r => r) : []
					});
				}
			}
		}

		return { commits, graphLines };
	}

	private parseGitLog(gitOutput: string): GitCommit[] {
		const commits: GitCommit[] = [];
		const lines = gitOutput.split('\n').filter(line => line.trim());

		for (const line of lines) {
			// Skip graph lines that don't contain commit data
			const commitMatch = line.match(/[a-f0-9]{40}\|/);
			if (!commitMatch) {
				continue;
			}

			const parts = line.split('|');
			if (parts.length < 7) {
				continue;
			}

			const [hash, shortHash, author, email, date, subject, parents, refs] = parts;

			commits.push({
				hash: hash.trim(),
				shortHash: shortHash.trim(),
				author: author.trim(),
				email: email.trim(),
				date: new Date(date.trim()),
				message: subject.trim(),
				subject: subject.trim(),
				parents: parents ? parents.trim().split(' ').filter(p => p) : [],
				refs: refs ? refs.trim().split(', ').filter(r => r) : []
			});
		}

		return commits;
	}

	private buildGraphData(commits: GitCommit[], graphLines: string[]): GitGraphNode[] {
		const colors = ['#007acc', '#f44747', '#ffcc00', '#00aa00', '#aa00ff', '#ff6600', '#00aaaa'];

		return commits.map((commit, index) => {
			const graphLine = graphLines[index] || '';
			const branchPosition = this.calculateBranchPosition(graphLine);

			return {
				commit,
				x: branchPosition.x,
				color: colors[branchPosition.branch % colors.length],
				connections: branchPosition.connections
			};
		});
	}

	private calculateBranchPosition(graphLine: string): { x: number, branch: number, connections: any[] } {
		// Analyze git graph symbols to determine branch position
		const cleanLine = graphLine.replace(/\s/g, '');
		let x = 0;
		let branch = 0;

		// Find the commit position (marked by * or |)
		for (let i = 0; i < cleanLine.length; i++) {
			const char = cleanLine[i];
			if (char === '*') {
				x = i * 20; // Position in pixels
				branch = i;
				break;
			} else if (char === '|' && i === 0) {
				x = i * 20;
				branch = i;
				break;
			}
		}

		return { x, branch, connections: [] };
	}

	private getHtmlForWebview(webview: vscode.Webview, repoName: string): string {
		const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'history', 'index.html');
		let html = require('fs').readFileSync(htmlPath.fsPath, 'utf8');

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'history', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'history', 'style.css'));

		// Patch the paths in the HTML file
		html = html.replace('main.js', scriptUri.toString());
		html = html.replace('style.css', styleUri.toString());

		// Inject CSP meta tag (important for Webview security)
		html = html.replace(
			'<head>',
			`<head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src ${webview.cspSource}; font-src ${webview.cspSource};">`
		);

		return html;
	}
}
