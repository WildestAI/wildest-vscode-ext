import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from '../services/GitService';
import { CliService } from '../services/CliService';
import { NotificationService } from '../services/NotificationService';
import { CliCommand } from '../utils/types';

export class DiffGraphViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _isGenerating: boolean = false;
	private _outputChannel: vscode.OutputChannel;
	private _isInitialLoad: boolean = true;
	private _notificationService: NotificationService;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
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
			const { repoRoot } = await GitService.getRepository();
			const htmlFilePath = path.join(os.tmpdir(), `diffgraph-output-${Date.now()}.html`);
			const cliCommand = CliService.setupCommand(htmlFilePath, this._context);

			await this.executeWithProgress(cliCommand, repoRoot, htmlFilePath, startTime);
		} catch (error: any) {
			vscode.window.showErrorMessage(error.message);
		} finally {
			this._isGenerating = false;
		}
	}

	private async executeWithProgress(
		cliCommand: CliCommand,
		repoRoot: string,
		htmlFilePath: string,
		startTime: number
	) {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Generating DiffGraph...',
			cancellable: false
		}, async (progress) => {
			try {
				const { stdout, stderr } = await CliService.execute(cliCommand, repoRoot, progress);
				this.logOutput(cliCommand.cliCmd, stdout, stderr);
				this._notificationService.sendOperationComplete(
					'DiffGraph',
					path.basename(repoRoot),
					{ startTime }
				);

				const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
				this.update(htmlContent);
			} catch (err) {
				vscode.window.showErrorMessage(`wild failed: ${err}`);
			}
		});
	}

	private logOutput(command: string, stdout: string, stderr: string) {
		this._outputChannel.appendLine(`Executed: ${command}`);
		this._outputChannel.appendLine('CLI stdout:\n' + stdout);
		if (stderr) {
			this._outputChannel.appendLine('CLI stderr:\n' + stderr);
		}
		this._outputChannel.show(true);
	}
}
