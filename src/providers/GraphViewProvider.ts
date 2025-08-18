import * as vscode from 'vscode';

export class GraphViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'wildestai.graphView';

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this.getComingSoonHtml();
	}

	private getComingSoonHtml(): string {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Graph</title>
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
						flex-direction: column;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
					.coming-soon {
						color: var(--vscode-descriptionForeground);
						font-style: italic;
						font-size: 18px;
						margin-bottom: 10px;
					}
					.description {
						color: var(--vscode-descriptionForeground);
						font-size: 14px;
						max-width: 300px;
						line-height: 1.4;
					}
					.icon {
						font-size: 48px;
						margin-bottom: 20px;
						opacity: 0.6;
					}
				</style>
			</head>
			<body>
				<div class="icon">📊</div>
				<div class="coming-soon">Coming soon...</div>
				<div class="description">
					The Graph view will show you the git log and history of your project, allowing you to visualize changes over time.
				</div>
			</body>
			</html>`;
	}
}
