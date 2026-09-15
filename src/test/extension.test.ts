import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('copies the registered sanitized runtime diagnostics report', async () => {
		const originalDevMode = process.env.WILDEST_DEV_MODE;
		const originalVenvPath = process.env.WILDEST_VENV_PATH;
		process.env.WILDEST_DEV_MODE = '1';
		process.env.WILDEST_VENV_PATH = '/tmp/token=runtime-path-secret';

		try {
			await vscode.commands.executeCommand('wildestai.copyRuntimeDiagnostics');
			const report = await vscode.env.clipboard.readText();
			assert.match(report, /WildestAI runtime diagnostics/);
			assert.match(report, /CLI path: \/tmp\/token=\[REDACTED\]/);
			assert.ok(!report.includes('runtime-path-secret'));
		} finally {
			if (originalDevMode === undefined) {
				delete process.env.WILDEST_DEV_MODE;
			} else {
				process.env.WILDEST_DEV_MODE = originalDevMode;
			}
			if (originalVenvPath === undefined) {
				delete process.env.WILDEST_VENV_PATH;
			} else {
				process.env.WILDEST_VENV_PATH = originalVenvPath;
			}
		}
	});
});
