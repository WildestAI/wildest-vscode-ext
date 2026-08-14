// Copyright (C) 2025  Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CliService } from '../services/CliService';

suite('CliService runtime diagnostics', () => {
	const context = {
		extensionPath: path.join(path.parse(process.cwd()).root, 'extension'),
	} as vscode.ExtensionContext;

	test('uses the same ready packaged binary for diagnostics and execution', () => {
		const executable = path.join(context.extensionPath, 'bin', 'wild-linux-arm64');
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'arm64', env: {},
			existsSync: (candidate: fs.PathLike) => candidate.toString() === executable,
			accessSync: () => undefined,
		};
		const diagnostics = CliService.inspectRuntime(context, runtime);
		const command = CliService.setupCommand(['--version'], context, runtime);
		assert.strictEqual(diagnostics.status, 'ready');
		assert.strictEqual(diagnostics.executable, executable);
		assert.strictEqual(command.executable, executable);
	});

	test('reports a missing binary with release guidance', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'darwin', architecture: 'x64', env: {}, existsSync: () => false,
			accessSync: () => undefined,
		});
		assert.strictEqual(diagnostics.status, 'missing');
		assert.match(diagnostics.detail, /Install a release that includes/);
		assert.match(diagnostics.detail, /wild-macos-x64/);
	});

	test('rejects a present but non-executable packaged binary consistently', () => {
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => { throw new Error('EACCES'); },
		};
		const diagnostics = CliService.inspectRuntime(context, runtime);
		assert.strictEqual(diagnostics.status, 'missing');
		assert.throws(
			() => CliService.setupCommand([], context, runtime),
			/not executable/
		);
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

	for (const target of [
		{ platform: 'linux' as NodeJS.Platform, binDir: 'bin', executableName: 'wild' },
		{ platform: 'win32' as NodeJS.Platform, binDir: 'Scripts', executableName: 'wild.exe' },
	]) {
		test(`uses the same ${target.platform} development executable for diagnostics and execution`, () => {
			const venvPath = path.join(path.parse(process.cwd()).root, `${target.platform}-venv`);
			const executable = path.join(venvPath, target.binDir, target.executableName);
			const runtime = {
				platform: target.platform,
				architecture: 'x64',
				env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath, PATH: 'existing-path' },
				existsSync: (candidate: fs.PathLike) => [venvPath, executable].includes(candidate.toString()),
				accessSync: () => undefined,
			};

			const diagnostics = CliService.inspectRuntime(context, runtime);
			const command = CliService.setupCommand(['--version'], context, runtime);

			assert.strictEqual(diagnostics.status, 'ready');
			assert.strictEqual(diagnostics.executable, executable);
			assert.strictEqual(command.executable, executable);
			assert.strictEqual(command.env.VIRTUAL_ENV, venvPath);
		});
	}

	test('resolves the default development environment from the extension root', () => {
		const venvPath = path.resolve(context.extensionPath, '..', 'DiffGraph-CLI', '.venv');
		const executable = path.join(venvPath, 'bin', 'wild');
		const runtime = {
			platform: 'linux' as NodeJS.Platform,
			architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1' },
			existsSync: (candidate: fs.PathLike) => [venvPath, executable].includes(candidate.toString()),
			accessSync: () => undefined,
		};

		assert.strictEqual(CliService.inspectRuntime(context, runtime).executable, executable);
		assert.strictEqual(CliService.setupCommand([], context, runtime).executable, executable);
	});
	test('probes CLI version and deterministic JSON schema capability', async () => {
		const executable = path.join(context.extensionPath, 'bin', 'wild-linux-x64');
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {},
			existsSync: (candidate: fs.PathLike) => candidate.toString() === executable,
			accessSync: () => undefined,
		};
		const calls: string[][] = [];
		const probe = await CliService.probeRuntime(context, runtime, async (_executable, args, timeoutMs) => {
			calls.push(args);
			assert.strictEqual(timeoutMs, 5000);
			return args[0] === '--version'
				? { stdout: 'wild, version 1.1.0\n', stderr: '' }
				: { stdout: 'Options:\n  --format [html|terminal|json]\n', stderr: '' };
		});

		assert.deepStrictEqual(calls, [['--version'], ['diff', '--help']]);
		assert.strictEqual(probe.status, 'compatible');
		assert.strictEqual(probe.cliVersion, '1.1.0');
		assert.match(probe.schemaSupport, /schema major 2/);
	});

	test('reports an incompatible CLI without JSON artifact output', async () => {
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {},
			existsSync: () => true,
			accessSync: () => undefined,
		};
		const probe = await CliService.probeRuntime(context, runtime, async (_executable, args) => args[0] === '--version'
			? { stdout: 'wild, version 1.0.0', stderr: '' }
			: { stdout: 'Options:\n  --output PATH', stderr: '' });

		assert.strictEqual(probe.status, 'incompatible');
		assert.match(probe.detail, /--format json/);
	});

	test('does not execute a probe when the runtime is missing', async () => {
		let executed = false;
		const probe = await CliService.probeRuntime(context, {
			platform: 'darwin', architecture: 'arm64', env: {},
			existsSync: () => false,
			accessSync: () => undefined,
		}, async () => {
			executed = true;
			return { stdout: '', stderr: '' };
		});

		assert.strictEqual(executed, false);
		assert.strictEqual(probe.status, 'unavailable');
		assert.strictEqual(probe.cliVersion, 'not available');
	});

	test('redacts CLI probe failures', async () => {
		const probe = await CliService.probeRuntime(context, {
			platform: 'linux', architecture: 'x64', env: {},
			existsSync: () => true,
			accessSync: () => undefined,
		}, async () => { throw new Error('secret path and token'); });

		assert.strictEqual(probe.status, 'unavailable');
		assert.doesNotMatch(probe.detail, /secret|token/);
	});

});
