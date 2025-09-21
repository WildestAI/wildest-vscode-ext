import * as fs from 'fs';
import * as path from 'path';
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


	async showStaticHtmlScreen(htmlFilePath: string, backupHtmlContent: string, name?: string): Promise<void> {
		try {
			const staticHtmlUri = vscode.Uri.joinPath(this._extensionUri, 'media', htmlFilePath);

			if (!fs.existsSync(staticHtmlUri.fsPath)) {
				console.warn(`${name} HTML file not found, using fallback message.`);
				// Fallback to backup message
				this.update(backupHtmlContent);
				return;
			}

			const htmlContent = fs.readFileSync(staticHtmlUri.fsPath, 'utf8');
			this.update(htmlContent);

			// Reveal the view if it's not visible
			if (this._view && !this._view.visible) {
				this._view.show?.(true);
			}
		} catch (error: any) {
			console.error(`Error showing ${name} screen:`, error);
			// Fallback to backup message
			this.update(backupHtmlContent);
		}
	}

	/**
	 * Shows a loading screen while the diff graph is being generated
	 */
	public async showLoadingScreen() {
		const loadingHtmlPath = 'loading-screen.html';
		const backupLoadingHtml = '<div style="padding: 20px; text-align: center; color: var(--vscode-foreground);">Loading DiffGraph...</div>';
		await this.showStaticHtmlScreen(loadingHtmlPath, backupLoadingHtml, 'loading');
	}

	public async showNoChangesScreen() {
		const noChangesHtmlPath = 'no-changes-screen.html';
		const backupNoChangesHtml = '<div style="padding: 20px; text-align: center; color: var(--vscode-foreground);">No changes to display.</div>';
		await this.showStaticHtmlScreen(noChangesHtmlPath, backupNoChangesHtml, 'no changes');
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

			const htmlContent = await fs.promises.readFile(htmlPath, 'utf8');

			// Update localResourceRoots to include the HTML file's directory
			if (this._view) {
				const htmlDir = vscode.Uri.file(path.dirname(htmlPath));
				this._view.webview.options = {
					enableScripts: true,
					localResourceRoots: [this._extensionUri, htmlDir]
				};
			}

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
