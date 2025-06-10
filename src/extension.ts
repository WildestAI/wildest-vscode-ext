// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "deeproots" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('deeproots.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from deeproots!');
	});

	context.subscriptions.push(disposable);

	let disposableDiffGraph = vscode.commands.registerCommand('diffGraph.generate', async () => {
		// Access the Git extension
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
		// Use the first repository for now
		const repository = git.repositories[0];
		const repoRoot = repository.rootUri.fsPath;
		const tmpDir = os.tmpdir();
		const outputDir = tmpDir;
		const htmlFileName = `diffgraph-output-${Date.now()}.html`;
		const htmlFilePath = path.join(outputDir, htmlFileName);

		// Restore .venv/bin to PATH for developer-mode CLI
		const venvPath = '/Users/apple/Work/wildest/DiffGraph-CLI/.venv';
		const venvBin = path.join(venvPath, 'bin');
		const env = Object.assign({}, process.env, {
			PATH: `${venvBin}:${process.env.PATH}`,
			VIRTUAL_ENV: venvPath
		});
		const cliCmd = `echo $(pwd); diffgraph-ai --output '${htmlFilePath}' --no-open`;

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
			interval = setInterval(() => {
				const elapsed = Math.floor((Date.now() - startTime) / 1000);
				const mins = Math.floor(elapsed / 60);
				const secs = elapsed % 60;
				progress.report({ message: `Elapsed: ${mins}:${secs.toString().padStart(2, '0')}` });
			}, 1000);

			try {
				await new Promise((resolve, reject) => {
					// Use zsh as a login shell to better match manual testing
					cp.exec(`zsh -l -c '${cliCmd.replace(/'/g, "'\\''")}'`, { cwd: repoRoot, env }, (error: any, stdout: string, stderr: string) => {
						cliStdout = stdout;
						cliStderr = stderr;
						if (error) {
							reject(error);
						} else {
							resolve(undefined);
						}
					});
				});
			} catch (err) {
				if (interval) { clearInterval(interval); }
				vscode.window.showInformationMessage(`output: ${cliStdout}`);
				vscode.window.showErrorMessage(`diffgraph-ai failed: ${err}`);
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

			// Create and show a new webview panel
			const panel = vscode.window.createWebviewPanel(
				'diffGraph',
				'DiffGraph',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true
				}
			);
			// Read the generated HTML file and show its contents in the webview
			let htmlContent = '';
			try {
				htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
			} catch (e) {
				htmlContent = `<html><body><h1>Error loading DiffGraph output</h1><pre>${e}</pre></body></html>`;
			}
			panel.webview.html = htmlContent;
		});
	});
	context.subscriptions.push(disposableDiffGraph);
}

// This method is called when your extension is deactivated
export function deactivate() { }
