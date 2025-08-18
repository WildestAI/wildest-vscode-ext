import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
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
			const commits = await this.getGitCommits(repoRoot);
			const graphData = this.buildGraphData(commits);
			
			this._view.webview.html = this.getHistoryHtml(graphData, repoRoot);
		} catch (error: any) {
			this._view.webview.html = this.getErrorHtml(error.message);
		}
	}

	private async getGitCommits(repoPath: string): Promise<GitCommit[]> {
		const cliCommand = this.setupLogCliCommand();
		
		try {
			// Create a simple progress object for CliService
			const progress = {
				report: (value: { message: string }) => {
					// Optional: could add progress reporting here
				}
			};
			
			const { stdout } = await CliService.execute(cliCommand, repoPath, progress);
			return this.parseGitLog(stdout);
		} catch (error: any) {
			throw new Error(`Failed to get git history: ${error.message}`);
		}
	}

	private setupLogCliCommand(): CliCommand {
		let env = Object.assign({}, process.env);
		const isDevMode = process.env.WILDEST_DEV_MODE === '1' || process.env.NODE_ENV === 'development';

		if (isDevMode) {
			const venvPath = process.env.WILDEST_VENV_PATH || '../DiffGraph-CLI/.venv';
			const venvBin = path.join(venvPath, 'bin');
			env = Object.assign({}, env, {
				PATH: `${venvBin}${path.delimiter}${env.PATH}`,
				VIRTUAL_ENV: venvPath
			});

			return {
				executable: 'wild',
				args: ['log', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'],
				env
			};
		} else {
			const wildBinary = this.getBinaryPath();
			return {
				executable: wildBinary,
				args: ['log', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'],
				env
			};
		}
	}

	private getBinaryPath(): string {
		const platform = os.platform();
		const arch = os.arch();

		let binaryName = '';
		if (platform === 'darwin' && arch === 'arm64') {
			binaryName = 'wild-macos-arm64';
		} else if (platform === 'darwin') {
			binaryName = 'wild-macos-x64';
		} else if (platform === 'linux' && arch === 'arm64') {
			binaryName = 'wild-linux-arm64';
		} else if (platform === 'linux') {
			binaryName = 'wild-linux-x64';
		} else if (platform === 'win32') {
			binaryName = 'wild-win.exe';
		} else {
			throw new Error(`Unsupported platform: ${platform} ${arch}`);
		}

		const binaryPath = path.join(this._context.extensionPath, 'bin', binaryName);

		if (!fs.existsSync(binaryPath)) {
			throw new Error(`Binary not found: ${binaryPath}`);
		}

		return binaryPath;
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

	private buildGraphData(commits: GitCommit[]): GitGraphNode[] {
		const colors = ['#007acc', '#f44747', '#ffcc00', '#00aa00', '#aa00ff', '#ff6600', '#00aaaa'];
		
		return commits.map((commit, index) => ({
			commit,
			x: index % 3, // Simple branching visualization
			color: colors[index % colors.length],
			connections: []
		}));
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
		const commitsJson = JSON.stringify(graphData.map(node => node.commit));
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
						width: 80px;
						flex-shrink: 0;
						display: flex;
						align-items: center;
						position: relative;
						padding: 0 10px;
					}
					.commit-dot {
						width: 10px;
						height: 10px;
						border-radius: 50%;
						background-color: var(--vscode-charts-blue);
						border: 2px solid var(--vscode-editor-background);
						position: relative;
						z-index: 2;
					}
					.graph-line {
						position: absolute;
						width: 2px;
						background-color: var(--vscode-charts-blue);
						left: 50%;
						transform: translateX(-50%);
					}
					.graph-line.vertical {
						height: 100%;
						top: 0;
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
							
							// Add vertical line for graph continuity (except for last commit)
							if (index < commits.length - 1) {
								const line = document.createElement('div');
								line.className = 'graph-line vertical';
								graph.appendChild(line);
							}
							
							const dot = document.createElement('div');
							dot.className = 'commit-dot';
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
