import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/GitService';
import { CliService } from '../services/CliService';
import { GitCommit, GitGraphNode, CliCommand } from '../utils/types';
import { GitHistoryCache } from '../services/GitHistoryCache';

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
	private _refreshPromise?: Promise<void>;
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

		void this.refresh(false);
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
		this._refreshPromise = this.runRefreshes(forceRefresh);
		try {
			await this._refreshPromise;
		} finally {
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

	private async runRefreshes(forceRefresh: boolean): Promise<void> {
		do {
			this._pendingForceRefresh = false;
			this._activeForceRefresh = forceRefresh;
			try {
				await this.loadGitHistory(forceRefresh);
			} catch (error) {
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

	private async loadGitHistory(forceRefresh: boolean): Promise<void> {
		if (!this._view) {
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
		this._view.webview.postMessage({ type: 'loading', state: true });

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
			if (repositories.length === 0) {
				this._view.webview.postMessage({ type: 'empty' });
				return;
			}

			const repoRoot = repositories[0].repoRoot;
			const repoName = path.basename(repoRoot);

			// Ensure HTML shell is set (idempotent)
			this._view.webview.html = this.getHtmlForWebview(this._view.webview, repoName);

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
				this._view.webview.postMessage({
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
					return await this.getGitCommits(repoRoot);
				} finally {
					gitFetchMs = performance.now() - gitFetchStartedAt;
				}
			})();

			const graphBuildStartedAt = performance.now();
			const graphData = this.buildGraphData(commits, graphLines);
			graphBuildMs += performance.now() - graphBuildStartedAt;
			this._view.webview.postMessage({
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
			if (hasUsableHistory) {
				void vscode.window.showWarningMessage('WildestAI could not refresh Git history. Showing the last cached result.');
			} else {
				this._view.webview.postMessage({ type: 'error', message: error.message ?? String(error) });
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
			// Ensure loading state is turned off in case of unexpected errors
			this._view.webview.postMessage({ type: 'loading', state: false });
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

	private async getGitCommits(repoPath: string): Promise<{ commits: GitCommit[], graphLines: string[] }> {
		try {
			// Always fetch fresh data
			const args = ['log', '--graph', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'];
			const command = CliService.setupCommand(args, this._context);
			const { stdout } = await CliService.execute(command, repoPath);
			const result = this.parseGitGraphLog(stdout);

			// Update cache with fresh data
			GitHistoryCache.update(repoPath, result.commits, result.graphLines);

			return result;
		} catch (error: any) {
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
