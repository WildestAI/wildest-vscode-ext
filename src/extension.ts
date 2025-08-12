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
import { DiffGraphViewProvider } from './providers/DiffGraphViewProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Register the DiffGraph view provider
	const provider = new DiffGraphViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.diffGraphView', provider)
	);

	// Register the hello world command
	const helloDisposable = vscode.commands.registerCommand('wildestai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Wildest AI!');
	});
	context.subscriptions.push(helloDisposable);

	// Register command to refresh the DiffGraph
	const disposableDiffGraph = vscode.commands.registerCommand('wildestai.generate', async () => {
		// Show and focus the DiffGraph view
		await vscode.commands.executeCommand('wildestai.diffGraphView.focus');
		// Trigger a refresh by calling the provider's generate method
		await provider.generateDiffGraph();
	});
	context.subscriptions.push(disposableDiffGraph);
}

// This method is called when your extension is deactivated
export function deactivate() { }
