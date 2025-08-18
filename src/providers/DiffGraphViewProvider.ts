import * as fs from 'fs';
import * as vscode from 'vscode';
import { NotificationService } from '../services/NotificationService';

export class DiffGraphViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _outputChannel: vscode.OutputChannel;
	private _notificationService: NotificationService;

	constructor(
		private readonly _extensionUri: vscode.Uri) {
		this._outputChannel = vscode.window.createOutputChannel('DiffGraph');
		this._notificationService = new NotificationService(this._outputChannel);
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
	}

	public update(htmlContent: string) {
		if (this._view) {
			this._view.webview.html = htmlContent;
			this._view.show?.(true);
		}
	}

	/**
	 * Shows a loading screen while the diff graph is being generated
	 */
	public async showLoadingScreen() {
		const backupLoadingHtml = '<div style="padding: 20px; text-align: center; color: var(--vscode-foreground);">Loading DiffGraph...</div>';
		try {
			const loadingUri = vscode.Uri.joinPath(this._extensionUri, 'media', 'loading-screen.html');

			if (!fs.existsSync(loadingUri.fsPath)) {
				console.warn('Loading screen HTML not found, using fallback message.');
				// Fallback to simple loading message
				this.update(backupLoadingHtml);
				return;
			}

			const htmlContent = fs.readFileSync(loadingUri.fsPath, 'utf8');
			this.update(htmlContent);

			// Reveal the view if it's not visible
			if (this._view && !this._view.visible) {
				this._view.show?.(true);
			}
		} catch (error: any) {
			console.error('Error showing loading screen:', error);
			// Fallback to simple loading message
			this.update(backupLoadingHtml);
		}
	}

	/**
	 * Shows the diff graph by loading HTML content from the specified file path
	 * @param htmlPath - Path to the HTML file to display
	 */
	public async showDiffGraph(htmlPath: string) {
		try {
			if (!fs.existsSync(htmlPath)) {
				throw new Error(`HTML file not found: ${htmlPath}`);
			}

			const htmlContent = fs.readFileSync(htmlPath, 'utf8');
			this.update(htmlContent);

			// Reveal the view if it's not visible
			if (this._view && !this._view.visible) {
				this._view.show?.(true);
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to show diff graph: ${error.message}`);
		}
	}
}
