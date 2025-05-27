// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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

	let disposableDiffGraph = vscode.commands.registerCommand('diffGraph.generate', () => {
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
