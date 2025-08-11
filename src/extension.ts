// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

class DiffGraphViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _isGenerating: boolean = false;
	private _outputChannel: vscode.OutputChannel;
	private _isInitialLoad: boolean = true;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
		this._outputChannel = vscode.window.createOutputChannel('DiffGraph');
	}

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

		// Generate the initial view when it becomes visible
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				if (this._isInitialLoad) {
					this.generateDiffGraph();
					this._isInitialLoad = false;
				}
			}
		});

		// If the view is already visible, generate the graph
		if (webviewView.visible) {
			this.generateDiffGraph();
			this._isInitialLoad = false;
		}
	}

	public update(htmlContent: string) {
		if (this._view) {
			this._view.webview.html = htmlContent;
			this._view.show?.(true);
		}
	}

	public async generateDiffGraph() {
		if (this._isGenerating) {
			vscode.window.showInformationMessage('DiffGraph generation is already in progress...');
			return;
		}

		this._isGenerating = true;
		const startTime = Date.now();

		try {
			// Get Git repository info
			const { repository, repoRoot } = await this.getGitRepository();

			// Setup output paths
			const htmlFilePath = path.join(os.tmpdir(), `diffgraph-output-${Date.now()}.html`);

			// Setup CLI command
			const { cliCmd, env } = this.setupCliCommand(htmlFilePath);

			// Execute CLI with progress
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Generating DiffGraph...',
				cancellable: false
			}, async (progress) => {
				try {
					const { stdout, stderr } = await this.executeCli(cliCmd, env, repoRoot, progress);

					// Log output
					this._outputChannel.appendLine(`Executed: ${cliCmd}`);
					this._outputChannel.appendLine('CLI stdout:\n' + stdout);
					if (stderr) {
						this._outputChannel.appendLine('CLI stderr:\n' + stderr);
					}
					this._outputChannel.show(true);

					// Send notification
					this.sendMacNotification(repoRoot, startTime);

					// Update view
					const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
					this.update(htmlContent);
				} catch (err) {
					vscode.window.showErrorMessage(`wild failed: ${err}`);
				}
			});
		} catch (error: any) {
			vscode.window.showErrorMessage(error.message);
		} finally {
			this._isGenerating = false;
		}
	}

	private async getGitRepository(): Promise<{ repository: any, repoRoot: string }> {
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			throw new Error('Git extension not found. Please ensure Git is enabled in VS Code.');
		}

		const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
		if (!git || !git.repositories || git.repositories.length === 0) {
			throw new Error('No Git repositories found in the workspace.');
		}

		const repository = git.repositories[0];
		const repoRoot = repository.rootUri.fsPath;
		return { repository, repoRoot };
	}

	private setupCliCommand(htmlFilePath: string): { cliCmd: string, env: NodeJS.ProcessEnv } {
		let env = Object.assign({}, process.env);
		const isDevMode = process.env.WILDEST_DEV_MODE === '1' || process.env.NODE_ENV === 'development';

		if (isDevMode) {
			console.log('Running in development mode');
			// Developer mode: use venv wild CLI
			const venvPath = '/Users/apple/Work/wildest/DiffGraph-CLI/.venv';
			const venvBin = path.join(venvPath, 'bin');
			env = Object.assign({}, process.env, {
				PATH: `${venvBin}:${process.env.PATH}`,
				VIRTUAL_ENV: venvPath
			});
			return { cliCmd: `wild diff --output '${htmlFilePath}' --no-open`, env };
		} else {
			console.log('Running in production mode');
			// Production: use packaged binary
			const wildBinary = getWildBinaryPath(this._context);
			return { cliCmd: `"${wildBinary}" diff --output '${htmlFilePath}' --no-open`, env };
		}
	}

	private async executeCli(cliCmd: string, env: NodeJS.ProcessEnv, repoRoot: string, progress: vscode.Progress<{ message: string }>): Promise<{ stdout: string, stderr: string }> {
		let cliStdout = '', cliStderr = '';
		const startTime = Date.now();
		let interval: NodeJS.Timeout | undefined = undefined;
		let lastCliLine = '';

		interval = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const mins = Math.floor(elapsed / 60);
			const secs = elapsed % 60;
			const elapsedStr = `Elapsed: ${mins}:${secs.toString().padStart(2, '0')}`;
			const message = lastCliLine ? `${elapsedStr} | ${lastCliLine}` : elapsedStr;
			progress.report({ message });
		}, 1000);

		try {
			await new Promise((resolve, reject) => {
				const shell = process.platform === 'win32' ? 'cmd' : (process.env.SHELL || '/bin/sh');
				const shellArgs = process.platform === 'win32' ? ['/c', cliCmd] : ['-l', '-c', cliCmd];
				const child = cp.spawn(shell, shellArgs, { cwd: repoRoot, env });

				child.stdout.setEncoding('utf8');
				child.stderr.setEncoding('utf8');

				child.stdout.on('data', (data: string) => {
					cliStdout += data;
					const lines = data.split(/\r?\n/).filter(Boolean);
					if (lines.length > 0) {
						lastCliLine = lines[lines.length - 1];
					}
				});

				child.stderr.on('data', (data: string) => {
					cliStderr += data;
					const lines = data.split(/\r?\n/).filter(Boolean);
					if (lines.length > 0) {
						lastCliLine = lines[lines.length - 1];
					}
				});

				child.on('error', reject);
				child.on('close', (code: number) => {
					code === 0 ? resolve(undefined) : reject(new Error(`wild exited with code ${code}`));
				});
			});
		} finally {
			if (interval) { clearInterval(interval); }
		}

		return { stdout: cliStdout, stderr: cliStderr };
	}

	private sendMacNotification(repoRoot: string, startTime: number): void {
		if (process.platform !== 'darwin') { return; }

		const repoName = path.basename(repoRoot);
		const elapsedMs = Date.now() - startTime;
		const elapsedMins = Math.floor(elapsedMs / 60000);
		const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
		const elapsedStr = `${elapsedMins}m ${elapsedSecs}s`;

		cp.exec(`terminal-notifier \
			-title "Wildest AI" \
			-subtitle "DiffGraph generation complete" \
			-message "DiffGraph for ${repoName} ready in ${elapsedStr}." \
			-activate "com.microsoft.VSCode" \
			-group "diffgraph-done"`,
			(error, stdout, stderr) => {
				if (error) {
					this._outputChannel.appendLine('Native notifications disabled: terminal-notifier not found');
					this._outputChannel.appendLine('To enable, install with: brew install terminal-notifier');
				}
				if (stderr) {
					this._outputChannel.appendLine('terminal-notifier stderr:');
					this._outputChannel.appendLine(stderr);
				}
			}
		);
	}
}

function getWildBinaryPath(context: vscode.ExtensionContext): string {
	const platform = os.platform();
	const arch = os.arch();

	let binaryName = '';
	if (platform === 'darwin' && arch === 'arm64') {
		binaryName = 'wild-macos-arm64';
	} else if (platform === 'darwin') {
		binaryName = 'wild-macos-x64';
	} else if (platform === 'linux') {
		binaryName = 'wild-linux-x64';
	} else if (platform === 'win32') {
		binaryName = 'wild-win.exe';
	} else {
		throw new Error(`Unsupported platform: ${platform} ${arch}`);
	}

	const binaryPath = path.join(context.extensionPath, 'bin', binaryName);

	// Validate that the binary actually exists
	if (!fs.existsSync(binaryPath)) {
		throw new Error(`Binary not found: ${binaryPath}`);
	}

	return binaryPath;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Register the DiffGraph view provider
	const provider = new DiffGraphViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.diffGraphView', provider)
	);

	// Register the hello world command
	const helloDisposable = vscode.commands.registerCommand('wildestai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Wildest AI!');
	});
	context.subscriptions.push(helloDisposable);

	// Register command to refresh the DiffGraph
	const disposableDiffGraph = vscode.commands.registerCommand('wildestai.generate', async () => {
		// Show and focus the DiffGraph view
		await vscode.commands.executeCommand('wildestai.diffGraphView.focus');
		// Trigger a refresh by calling the provider's generate method
		await provider.generateDiffGraph();
	});
	context.subscriptions.push(disposableDiffGraph);
}

// This method is called when your extension is deactivated
export function deactivate() { }
