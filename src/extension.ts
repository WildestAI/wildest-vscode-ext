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

		// Set up environment variables for the CLI
		const env = Object.assign({}, process.env, {
			GIT_DIR: repoRoot,
			OUTPUT_PATH: outputDir,
			LINK_URL: 'vscode://file/' // VSCode file URI prefix for navigation
		});

		// Build the CLI command (no commit ids for unstaged changes)
		const cliCmd = `diffgraph-cli --output ${htmlFileName}`;
		let cliStdout = '', cliStderr = '';
		const outputChannel = vscode.window.createOutputChannel('DiffGraph');
		try {
			await new Promise((resolve, reject) => {
				cp.exec(cliCmd, { env }, (error: any, stdout: string, stderr: string) => {
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
			vscode.window.showErrorMessage(`diffgraph-cli failed: ${err}\n${cliStderr}`);
			return;
		}
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
			'diffGraph', // Identifies the type of the webview. Used internally
			'DiffGraph', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
			{
				enableScripts: true // Enable scripts for mermaid rendering
			}
		);
		// Set placeholder HTML content with a mermaid diagram
		panel.webview.html = `
			<html>
			<head>
				<script type="module">
					import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.esm.min.mjs';
					mermaid.initialize({
						startOnLoad: true,
						themeVariables: {
							edgeLabelBackground: '#222',
							arrowheadColor: '#fff',
							lineColor: '#fff'
						}
					});
				</script>
				<style>
					body { font-family: sans-serif; margin: 0; padding: 1.5em; }
					h1 { color: #2d5fa4; }
					.mermaid { border-radius: 8px; padding: 1em; box-shadow: 0 2px 8px #0001; }
					.mermaid .edgePath path,
					.mermaid .arrowheadPath {
						stroke: #fff !important;
						fill: #fff !important;
					}
				</style>
			</head>
			<body>
				<h1>Generating DiffGraph...</h1>
				<div class="mermaid">
					graph TD
					  A[main.ts] --> B[utils.ts]
					  A --> C[api.ts]
					  B --> D[logger.ts]
					  C --> D
					  D --> E[config.ts]
				</div>
			</body>
			</html>
		`;
	});
	context.subscriptions.push(disposableDiffGraph);
}

// This method is called when your extension is deactivated
export function deactivate() { }
