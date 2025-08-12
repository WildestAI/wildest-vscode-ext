import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export class NotificationService {
	constructor(private readonly outputChannel: vscode.OutputChannel) { }

	public sendOperationComplete(
		operation: string,
		itemName: string,
		duration: { startTime: number }
	): void {
		const elapsedMs = Date.now() - duration.startTime;
		const elapsedMins = Math.floor(elapsedMs / 60000);
		const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
		const elapsedStr = `${elapsedMins}m ${elapsedSecs}s`;
		const message = `${operation} for ${itemName} ready in ${elapsedStr}.`;

		// Always show in VS Code
		vscode.window.showInformationMessage(message);

		// Platform-specific native notifications
		if (process.platform === 'darwin') {
			this.sendDarwinNotification(operation, itemName, elapsedStr);
		}
		// Add other platform-specific implementations here
		// else if (process.platform === 'win32') { ... }
		// else if (process.platform === 'linux') { ... }
	}

	private sendDarwinNotification(operation: string, itemName: string, elapsedStr: string): void {
		cp.execFile('terminal-notifier', [
			'-title', 'Wildest AI',
			'-subtitle', `${operation} complete`,
			'-message', `${operation} for ${itemName} ready in ${elapsedStr}.`,
			'-activate', 'com.microsoft.VSCode',
			'-group', 'wildest-operation-done'
		], (error, stdout, stderr) => {
			if (error) {
				const enoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
				if (enoent) {
					this.outputChannel.appendLine('Native notifications disabled: terminal-notifier not found.');
					this.outputChannel.appendLine('To enable, install with: brew install terminal-notifier');
				} else {
					this.outputChannel.appendLine(`Native notification failed: ${error.message}`);
				}
				// Log the attempted values for diagnostics
				this.outputChannel.appendLine(`Debug info - operation: ${operation}, item: ${itemName}, elapsed: ${elapsedStr}`);
			}
			if (stderr) {
				this.outputChannel.appendLine('terminal-notifier stderr:');
				this.outputChannel.appendLine(stderr);
			}
		});
	}
}
