import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export function sendMacNotification(
	repoRoot: string,
	startTime: number,
	outputChannel: vscode.OutputChannel
): void {
	if (process.platform !== 'darwin') { return; }

	const repoName = path.basename(repoRoot);
	const elapsedMs = Date.now() - startTime;
	const elapsedMins = Math.floor(elapsedMs / 60000);
	const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
	const elapsedStr = `${elapsedMins}m ${elapsedSecs}s`;

	cp.execFile('terminal-notifier', [
		'-title', 'Wildest AI',
		'-subtitle', 'DiffGraph generation complete',
		'-message', `DiffGraph for ${repoName} ready in ${elapsedStr}.`,
		'-activate', 'com.microsoft.VSCode',
		'-group', 'diffgraph-done'
	], (error, stdout, stderr) => {
		if (error) {
			outputChannel.appendLine('Native notifications disabled: terminal-notifier not found');
			outputChannel.appendLine('To enable, install with: brew install terminal-notifier');
			outputChannel.appendLine(`Debug info - repoName: ${repoName}, elapsed: ${elapsedStr}`);
		}
		if (stderr) {
			outputChannel.appendLine('terminal-notifier stderr:');
			outputChannel.appendLine(stderr);
		}
	});
}
