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

import * as vscode from 'vscode';
import { DiffGraphExplorerProvider } from './providers/DiffGraphExplorerProvider';
import { DiffGraphViewProvider } from './providers/DiffGraphViewProvider';
import { HistoryViewProvider } from './providers/HistoryViewProvider';
import { DiffService } from './services/DiffService';
import { GitService } from './services/GitService';
import { CliService } from './services/CliService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Keep the old provider for backwards compatibility with generate command
	const diffGraphWebViewProvider = new DiffGraphViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.diffGraphView', diffGraphWebViewProvider)
	);

	// Register services with provider reference
	const diffService = new DiffService(context, diffGraphWebViewProvider);

	// Register the Changes webview provider
	const changesProvider = new DiffGraphExplorerProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('wildestai.changesView', changesProvider)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('wildestai.changesViewInSCM', changesProvider)
	);

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.refreshChangesView', () => {
		changesProvider.updateRepositories();
	}));

	// Register the History webview provider with commit click callback
	const historyProvider = new HistoryViewProvider(
		context.extensionUri,
		context,
		async (commitHash: string, repoPath: string) => {
			await diffService.openCommitDiff(context, commitHash, repoPath);
		}
	);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.historyView', historyProvider)
	);

	// Register history refresh command
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.refreshHistory', async () => {
		await historyProvider.refresh();
	}));

	// Register the hello world command
	const helloDisposable = vscode.commands.registerCommand('wildestai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Wildest AI!');
	});
	context.subscriptions.push(helloDisposable);

	const runtimeDiagnosticsOutput = vscode.window.createOutputChannel('WildestAI Diagnostics');
	context.subscriptions.push(runtimeDiagnosticsOutput);
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.showRuntimeDiagnostics', async () => {
		const diagnostics = CliService.inspectRuntime(context);
		const probe = await CliService.probeRuntime(diagnostics);
		const extensionVersion = context.extension.packageJSON.version || 'unknown';
		runtimeDiagnosticsOutput.clear();
		runtimeDiagnosticsOutput.appendLine('WildestAI runtime diagnostics');
		runtimeDiagnosticsOutput.appendLine(`Extension version: ${extensionVersion}`);
		runtimeDiagnosticsOutput.appendLine(`CLI source: ${diagnostics.source}`);
		runtimeDiagnosticsOutput.appendLine(`CLI status: ${diagnostics.status}`);
		runtimeDiagnosticsOutput.appendLine(`Platform: ${diagnostics.platform}/${diagnostics.architecture}`);
		runtimeDiagnosticsOutput.appendLine(`CLI path: ${diagnostics.executable || 'not available'}`);
		runtimeDiagnosticsOutput.appendLine(`CLI version: ${probe.cliVersion}`);
		runtimeDiagnosticsOutput.appendLine(`Artifact compatibility: ${probe.status}`);
		runtimeDiagnosticsOutput.appendLine(`Schema support: ${probe.schemaSupport}`);
		runtimeDiagnosticsOutput.appendLine(`Details: ${diagnostics.detail}`);
		runtimeDiagnosticsOutput.appendLine(`Probe details: ${probe.detail}`);
		runtimeDiagnosticsOutput.appendLine('Provider readiness: not yet configured by this extension');
		runtimeDiagnosticsOutput.show(true);

		if (diagnostics.status !== 'ready') {
			void vscode.window.showWarningMessage(`WildestAI CLI ${diagnostics.status}: ${diagnostics.detail}`);
		}
	}));

	// Register legacy commands for backwards compatibility
	const openChangesDisposable = vscode.commands.registerCommand('wildestai.openChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.openChanges(context, repoPath);
		}
	});
	context.subscriptions.push(openChangesDisposable);

	const openStagedChangesDisposable = vscode.commands.registerCommand('wildestai.openStagedChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.openStagedChanges(context, repoPath);
		}
	});
	context.subscriptions.push(openStagedChangesDisposable);

	const refreshChangesDisposable = vscode.commands.registerCommand('wildestai.refreshChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.refreshChanges(context, repoPath);
		}
	});
	context.subscriptions.push(refreshChangesDisposable);

	const refreshStagedChangesDisposable = vscode.commands.registerCommand('wildestai.refreshStagedChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.refreshStagedChanges(context, repoPath);
		}
	});
	context.subscriptions.push(refreshStagedChangesDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
