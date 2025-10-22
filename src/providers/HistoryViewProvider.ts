import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../services/GitService';
import { CliService } from '../services/CliService';
import { GitCommit, GitGraphNode, CliCommand } from '../utils/types';
import { GitHistoryCache } from '../services/GitHistoryCache';

export class HistoryViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'wildestai.historyView';
	private _view?: vscode.WebviewView;
	private _currentRepoRoot?: string;

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
				await this.refresh();
			}
		});

		this.refresh();
	}

	public async refresh(): Promise<void> {
		try {
			await this.loadGitHistory();
		} catch (error) {
			if (error instanceof Error && error.message.includes('Timeout waiting for Git')) {
				// If we hit a timeout, schedule another refresh attempt
				setTimeout(() => this.refresh(), 2000);
			} else {
				throw error;
			}
		}
	}

	private async loadGitHistory(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			const repositories = await GitService.getRepositories();
			if (repositories.length === 0) {
				this._view.webview.postMessage({ type: 'empty' });
				return;
			}

			const repoRoot = repositories[0].repoRoot;
			const repoName = path.basename(repoRoot);

			// Ensure HTML shell is set (idempotent)
			this._view.webview.html = this.getHtmlForWebview(this._view.webview, repoName);

			// Show loading state before fetching data
			this._view.webview.postMessage({ type: 'loading', state: true });

			const { commits, graphLines } = await this.getGitCommits(repoRoot);

			const graphData = this.buildGraphData(commits, graphLines);
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
		} catch (error: any) {
			this._view.webview.postMessage({ type: 'error', message: error.message ?? String(error) });
		} finally {
			// Ensure loading state is turned off in case of unexpected errors
			this._view.webview.postMessage({ type: 'loading', state: false });
		}
	}

	private async getGitCommits(repoPath: string): Promise<{ commits: GitCommit[], graphLines: string[] }> {
		try {
			// Get git log with graph and detailed format combined
			const args = ['log', '--graph', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'];
			const command = CliService.setupCommand(args, this._context);
			const { stdout } = await CliService.execute(command, repoPath);
			const result = this.parseGitGraphLog(stdout);
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
