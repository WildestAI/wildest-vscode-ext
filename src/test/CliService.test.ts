// Copyright (C) 2025  Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { CliService } from '../services/CliService';

suite('CliService runtime diagnostics', () => {
	const context = {
		extensionPath: path.join(path.parse(process.cwd()).root, 'extension'),
	} as vscode.ExtensionContext;

	test('reports a ready packaged binary for an exact supported target', () => {
		const executable = path.join(context.extensionPath, 'bin', 'wild-linux-arm64');
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'arm64', env: {},
			existsSync: candidate => candidate.toString() === executable,
			accessSync: () => undefined,
		});
		assert.strictEqual(diagnostics.status, 'ready');
		assert.strictEqual(diagnostics.executable, executable);
	});

	test('reports a missing binary with reinstall guidance', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'darwin', architecture: 'x64', env: {}, existsSync: () => false,
			accessSync: () => undefined,
		});
		assert.strictEqual(diagnostics.status, 'missing');
		assert.match(diagnostics.detail, /Reinstall the extension/);
		assert.match(diagnostics.detail, /wild-macos-x64/);
	});

	test('does not report a present but non-executable packaged binary as ready', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => { throw new Error('EACCES'); },
		});
		assert.strictEqual(diagnostics.status, 'missing');
	});

	test('rejects unsupported architecture instead of selecting a wrong binary', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'win32', architecture: 'arm64', env: {}, existsSync: () => true,
			accessSync: () => undefined,
		});
		assert.strictEqual(diagnostics.status, 'unsupported');
		assert.strictEqual(diagnostics.executable, undefined);
		assert.match(diagnostics.detail, /win32\/arm64/);
	});

	test('reports development virtual environment readiness', () => {
		const venvPath = path.join(path.parse(process.cwd()).root, 'venv');
		const executable = path.join(venvPath, 'bin', 'wild');
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: candidate => [venvPath, executable].includes(candidate.toString()),
			accessSync: () => undefined,
		});
		assert.strictEqual(diagnostics.source, 'development environment');
		assert.strictEqual(diagnostics.status, 'ready');
		assert.strictEqual(diagnostics.executable, executable);
	});
});
