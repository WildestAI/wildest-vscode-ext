// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffGraphViewProvider } from '../providers/DiffGraphViewProvider';

suite('DiffGraphViewProvider Test Suite', () => {
	test('keeps a usable graph visible while a replacement is generated', async () => {
		const provider = new DiffGraphViewProvider(vscode.Uri.file('/mock/extension'));
		const webview = { html: '', options: {} } as unknown as vscode.Webview;
		const view = {
			webview,
			visible: true,
			show: () => undefined
		} as unknown as vscode.WebviewView;
		provider.resolveWebviewView(
			view,
			{} as vscode.WebviewViewResolveContext,
			new vscode.CancellationTokenSource().token
		);

		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wildest-view-test-'));
		const graphPath = path.join(tempDir, 'graph.html');
		const graphHtml = '<html><body>usable graph</body></html>';
		fs.writeFileSync(graphPath, graphHtml);

		try {
			await provider.showDiffGraph(graphPath);
			await provider.showLoadingScreen();

			assert.strictEqual(webview.html, graphHtml);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
