import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as util from 'util';
import { GitService } from '../services/GitService';
import { CliService } from '../services/CliService';
import { GitCommit, GitGraphNode, CliCommand } from '../utils/types';

export class HistoryViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'wildestai.historyView';
	private _view?: vscode.WebviewView;

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

		// Set up message handling from webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'commitClicked' && message.commitHash && message.repoPath) {
				await this._onCommitClicked(message.commitHash, message.repoPath);
			} else if (message.command === 'refresh') {
				await this.refresh();
			}
		});

		this.loadGitHistory();
	}

	public async refresh(): Promise<void> {
		await this.loadGitHistory();
	}

	private async loadGitHistory(): Promise<void> {
		if (!this._view) {
			return;
		}

		try {
			this._view.webview.html = this.getLoadingHtml();

			const repositories = await GitService.getRepositories();
			if (repositories.length === 0) {
				this._view.webview.html = this.getNoRepoHtml();
				return;
			}

			// For now, use the first repository
			const repoRoot = repositories[0].repoRoot;
			const { commits, graphLines } = await this.getGitCommits(repoRoot);
			const graphData = this.buildGraphData(commits, graphLines);

			this._view.webview.html = this.getHistoryHtml(graphData, repoRoot);
		} catch (error: any) {
			this._view.webview.html = this.getErrorHtml(error.message);
		}
	}

	private async getGitCommits(repoPath: string): Promise<{ commits: GitCommit[], graphLines: string[] }> {
		try {
			// Get git log with graph and detailed format combined
			const args = ['log', '--graph', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'];
			const command = CliService.setupCommand(args, this._context);
			const { stdout } = await CliService.execute(command, repoPath);

			return this.parseGitGraphLog(stdout);
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

	private getLoadingHtml(): string {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>History</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						margin: 0;
						padding: 20px;
						text-align: center;
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
					.loading {
						color: var(--vscode-descriptionForeground);
					}
				</style>
			</head>
			<body>
				<div class="loading">Loading git history...</div>
			</body>
			</html>`;
	}

	private getNoRepoHtml(): string {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>History</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						margin: 0;
						padding: 20px;
						text-align: center;
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
					.no-repo {
						color: var(--vscode-descriptionForeground);
					}
				</style>
			</head>
			<body>
				<div class="no-repo">No git repositories found</div>
			</body>
			</html>`;
	}

	private getErrorHtml(errorMessage: string): string {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>History</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-errorForeground);
						background-color: var(--vscode-editor-background);
						margin: 0;
						padding: 20px;
						text-align: center;
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
				</style>
			</head>
			<body>
				<div>Error: ${errorMessage}</div>
			</body>
			</html>`;
	}

	private getHistoryHtml(graphData: GitGraphNode[], repoPath: string): string {
		const commitsJson = JSON.stringify(graphData.map(node => ({
			...node.commit,
			x: node.x,
			color: node.color
		})));
		const repoName = repoPath.split('/').pop() || 'Unknown';

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Git History</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						margin: 0;
						padding: 0;
						overflow-x: auto;
					}
					.history-container {
						padding: 10px;
					}
					.header {
						padding: 10px 0;
						border-bottom: 1px solid var(--vscode-widget-border);
						margin-bottom: 10px;
					}
					.repo-name {
						font-weight: bold;
						color: var(--vscode-foreground);
					}
					.commit-list {
						list-style: none;
						margin: 0;
						padding: 0;
					}
					.commit-item {
						display: flex;
						align-items: center;
						padding: 8px 0;
						border-bottom: 1px solid var(--vscode-widget-border);
						cursor: pointer;
						min-height: 40px;
					}
					.commit-item:hover {
						background-color: var(--vscode-list-hoverBackground);
					}
					.commit-item:active {
						background-color: var(--vscode-list-activeSelectionBackground);
					}
					.commit-graph {
						width: 200px;
						flex-shrink: 0;
						position: relative;
						height: 40px;
						margin-right: 10px;
					}
					.commit-dot {
						width: 8px;
						height: 8px;
						border-radius: 50%;
						position: absolute;
						top: 50%;
						transform: translateY(-50%);
						z-index: 10;
						border: 1px solid var(--vscode-editor-background);
					}
					.graph-line {
						position: absolute;
						height: 2px;
						top: 50%;
						transform: translateY(-50%);
						z-index: 1;
					}
					.graph-line.vertical {
						width: 2px;
						height: 40px;
						top: 0;
						transform: none;
					}
					.commit-info {
						flex: 1;
						padding: 0 10px;
					}
					.commit-message {
						font-weight: 500;
						margin-bottom: 4px;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
					.commit-meta {
						font-size: 12px;
						color: var(--vscode-descriptionForeground);
					}
					.commit-hash {
						font-family: var(--vscode-editor-font-family);
						background-color: var(--vscode-badge-background);
						color: var(--vscode-badge-foreground);
						padding: 2px 6px;
						border-radius: 3px;
						font-size: 11px;
						margin-right: 8px;
					}
					.refresh-button {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						border-radius: 3px;
						padding: 6px 12px;
						cursor: pointer;
						font-size: 12px;
						margin-left: 10px;
					}
					.refresh-button:hover {
						background: var(--vscode-button-hoverBackground);
					}
				</style>
			</head>
			<body>
				<div class="history-container">
					<div class="header">
						<span class="repo-name">${repoName}</span>
						<button class="refresh-button" onclick="refresh()">Refresh</button>
					</div>
					<ul class="commit-list" id="commitList">
						<!-- Commits will be populated by JavaScript -->
					</ul>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					const commits = ${commitsJson};
					const repoPath = "${repoPath}";

					function refresh() {
						vscode.postMessage({ command: 'refresh' });
					}

					function onCommitClick(commitHash) {
						vscode.postMessage({
							command: 'commitClicked',
							commitHash: commitHash,
							repoPath: repoPath
						});
					}

					function renderCommits() {
						const commitList = document.getElementById('commitList');
						commitList.innerHTML = '';

						commits.forEach((commit, index) => {
							const li = document.createElement('li');
							li.className = 'commit-item';
							li.onclick = () => onCommitClick(commit.hash);

							const graph = document.createElement('div');
							graph.className = 'commit-graph';

							// Draw vertical line to next commit (if not last)
							if (index < commits.length - 1) {
								const nextCommit = commits[index + 1];
								const verticalLine = document.createElement('div');
								verticalLine.className = 'graph-line vertical';
								verticalLine.style.backgroundColor = commit.color;
								verticalLine.style.left = commit.x + 'px';
								graph.appendChild(verticalLine);
							}

							// Draw horizontal line for merges/branches
							if (commit.parents && commit.parents.length > 1) {
								const horizontalLine = document.createElement('div');
								horizontalLine.className = 'graph-line';
								horizontalLine.style.backgroundColor = commit.color;
								horizontalLine.style.left = (commit.x - 20) + 'px';
								horizontalLine.style.width = '40px';
								graph.appendChild(horizontalLine);
							}

							// Position the commit dot
							const dot = document.createElement('div');
							dot.className = 'commit-dot';
							dot.style.backgroundColor = commit.color;
							dot.style.left = commit.x + 'px';
							graph.appendChild(dot);

							const info = document.createElement('div');
							info.className = 'commit-info';

							const message = document.createElement('div');
							message.className = 'commit-message';
							message.textContent = commit.subject;

							const meta = document.createElement('div');
							meta.className = 'commit-meta';

							const hash = document.createElement('span');
							hash.className = 'commit-hash';
							hash.textContent = commit.shortHash;

							const dateStr = new Date(commit.date).toLocaleDateString() + ' ' +
											new Date(commit.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
							const author = document.createTextNode(commit.author + ' • ' + dateStr);

							meta.appendChild(hash);
							meta.appendChild(author);

							info.appendChild(message);
							info.appendChild(meta);

							li.appendChild(graph);
							li.appendChild(info);
							commitList.appendChild(li);
						});
					}

					renderCommits();
				</script>
			</body>
			</html>`;
	}
}
