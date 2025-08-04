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

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
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

		// Generate the initial view when it becomes visible
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.generateDiffGraph();
			}
		});

		// If the view is already visible, generate the graph
		if (webviewView.visible) {
			this.generateDiffGraph();
		}
	}

	public update(htmlContent: string) {
		if (this._view) {
			this._view.webview.html = htmlContent;
			this._view.show?.(true);
		}
	}

	public async generateDiffGraph() {
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			vscode.window.showErrorMessage('Git extension not found. Please ensure Git is enabled in VS Code.');
			return;
		}
		const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
		if (!git || !git.repositories || git.repositories.length === 0) {
			vscode.window.showErrorMessage('No Git repositories found in the workspace.');
			return;
		}

		const repository = git.repositories[0];
		const repoRoot = repository.rootUri.fsPath;
		const tmpDir = os.tmpdir();
		const outputDir = tmpDir;
		const htmlFileName = `diffgraph-output-${Date.now()}.html`;
		const htmlFilePath = path.join(outputDir, htmlFileName);

		// Choose CLI path based on dev/prod mode
		let cliCmd: string;
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
			cliCmd = `wild --output '${htmlFilePath}' --no-open`;
		} else {
			console.log('Running in production mode');
			// Production: use packaged binary
			const wildBinary = getWildBinaryPath(this._context);
			cliCmd = `"${wildBinary}" --output '${htmlFilePath}' --no-open`;
		}

		// Show a progress notification while the CLI runs
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Generating DiffGraph... (this may take several minutes)',
			cancellable: false
		}, async (progress) => {
			let cliStdout = '', cliStderr = '';
			const outputChannel = vscode.window.createOutputChannel('DiffGraph');

			// Stopwatch logic
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
					// Use zsh as a login shell to better match manual testing
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
					child.on('error', (err: any) => {
						reject(err);
					});
					child.on('close', (code: number) => {
						if (code !== 0) {
							reject(new Error(`wild exited with code ${code}`));
						} else {
							resolve(undefined);
						}
					});
				});
			} catch (err) {
				if (interval) { clearInterval(interval); }
				vscode.window.showInformationMessage(`output: ${cliStdout}`);
				vscode.window.showErrorMessage(`wild failed: ${err}`);
				vscode.window.showWarningMessage(`error: ${cliStderr}`);
				return;
			}
			if (interval) { clearInterval(interval); }

			// Log CLI command and output/errors
			outputChannel.appendLine(`Executed: ${cliCmd}`);
			outputChannel.appendLine('CLI stdout:');
			outputChannel.appendLine(cliStdout);
			if (cliStderr) {
				outputChannel.appendLine('CLI stderr:');
				outputChannel.appendLine(cliStderr);
			}
			outputChannel.show(true);

			// macOS native notification
			if (process.platform === 'darwin') {
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
					-group "diffgraph-done"
				`);
			}

			// Update the view with the new content
			let htmlContent = '';
			try {
				htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
			} catch (e) {
				htmlContent = `<html><body><h1>Error loading DiffGraph output</h1><pre>${e}</pre></body></html>`;
			}
			this.update(htmlContent);
		});
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

	return path.join(context.extensionPath, 'bin', binaryName);
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
