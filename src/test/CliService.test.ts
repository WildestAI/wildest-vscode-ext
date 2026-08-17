// Copyright (C) 2025  Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CliService } from '../services/CliService';

const fileError = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });
const regularFileStats = { isFile: () => true } as fs.Stats;

const validPeHeader = (length: number): Buffer => {
	const header = Buffer.alloc(0x84);
	header[0] = 0x4d;
	header[1] = 0x5a;
	header.writeUInt32LE(0x80, 0x3c);
	header.write('PE\0\0', 0x80, 'binary');
	return header.subarray(0, length);
};

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
			statSync: () => regularFileStats,
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
			accessSync: () => { throw fileError('ENOENT'); },
			statSync: () => regularFileStats,
		});
		assert.strictEqual(diagnostics.status, 'missing');
		assert.match(diagnostics.detail, /Install a release that includes/);
		assert.match(diagnostics.detail, /wild-macos-x64/);
	});

	test('rejects a present but non-executable packaged binary consistently', () => {
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => { throw fileError('EACCES'); },
			statSync: () => regularFileStats,
		};
		const diagnostics = CliService.inspectRuntime(context, runtime);
		assert.strictEqual(diagnostics.status, 'permission-denied');
		assert.match(diagnostics.detail, /exists but cannot be executed/);
		assert.match(diagnostics.detail, /Reinstall/);
		assert.throws(
			() => CliService.setupCommand([], context, runtime),
			/not executable/
		);
	});

	test('does not report an unexpected I/O failure as permission-denied', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => { throw fileError('EIO'); },
			statSync: () => regularFileStats,
		});

		assert.strictEqual(diagnostics.status, 'invalid');
		assert.match(diagnostics.detail, /could not be validated/);
	});

	test('distinguishes a non-executable development CLI from a missing environment', () => {
		const venvPath = path.join(path.parse(process.cwd()).root, 'venv');
		const executable = path.join(venvPath, 'bin', 'wild');
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: candidate => [venvPath, executable].includes(candidate.toString()),
			accessSync: () => { throw fileError('EACCES'); },
			statSync: () => regularFileStats,
		});

		assert.strictEqual(diagnostics.status, 'permission-denied');
		assert.match(diagnostics.detail, /Restore execute permission/);
	});

	test('reports a missing development virtual environment', () => {
		const venvPath = path.join(path.parse(process.cwd()).root, 'missing-venv');
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: () => false,
			accessSync: () => { throw fileError('ENOENT'); },
			statSync: () => { throw fileError('ENOENT'); },
		});

		assert.strictEqual(diagnostics.status, 'missing');
		assert.match(diagnostics.detail, /virtual environment is missing/);
		assert.match(diagnostics.detail, new RegExp(venvPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	});

	test('reports an inaccessible development virtual environment', () => {
		const venvPath = path.join(path.parse(process.cwd()).root, 'inaccessible-venv');
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: () => false,
			accessSync: () => undefined,
			statSync: () => { throw fileError('EACCES'); },
		};

		const diagnostics = CliService.inspectRuntime(context, runtime);
		assert.strictEqual(diagnostics.status, 'permission-denied');
		assert.match(diagnostics.detail, /virtual environment cannot be accessed/);
		assert.match(diagnostics.detail, new RegExp(venvPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.throws(() => CliService.setupCommand([], context, runtime), /cannot be accessed/);
	});

	test('reports a missing development executable', () => {
		const venvPath = path.join(path.parse(process.cwd()).root, 'venv');
		const executable = path.join(venvPath, 'bin', 'wild');
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: candidate => candidate.toString() === venvPath,
			accessSync: () => { throw fileError('ENOENT'); },
			statSync: () => regularFileStats,
		});

		assert.strictEqual(diagnostics.status, 'missing');
		assert.match(diagnostics.detail, /wild executable is missing/);
		assert.match(diagnostics.detail, new RegExp(executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		assert.throws(() => CliService.setupCommand([], context, {
			platform: 'linux', architecture: 'x64',
			env: { WILDEST_DEV_MODE: '1', WILDEST_VENV_PATH: venvPath },
			existsSync: candidate => candidate.toString() === venvPath,
			accessSync: () => { throw fileError('ENOENT'); },
			statSync: () => regularFileStats,
		}), /not found or invalid/);
	});

	test('rejects an existing non-launchable Windows artifact consistently', () => {
		const executable = path.join(context.extensionPath, 'bin', 'wild-win.exe');
		const runtime = {
			platform: 'win32' as NodeJS.Platform, architecture: 'x64', env: {},
			existsSync: (candidate: fs.PathLike) => candidate.toString() === executable,
			accessSync: () => undefined,
			statSync: () => regularFileStats,
			readFileHeader: () => Buffer.from('#!'),
		};

		const diagnostics = CliService.inspectRuntime(context, runtime);
		assert.strictEqual(diagnostics.status, 'invalid');
		assert.match(diagnostics.detail, /not a launchable file/);
		assert.throws(() => CliService.setupCommand([], context, runtime), /invalid/);
	});

	test('rejects an MZ-only Windows artifact', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'win32', architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => undefined,
			statSync: () => regularFileStats,
			readFileHeader: () => Buffer.from('MZ'),
		});

		assert.strictEqual(diagnostics.status, 'invalid');
		assert.match(diagnostics.detail, /not a launchable file/);
	});

	test('rejects an executable directory on POSIX', () => {
		const runtime = {
			platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {}, existsSync: () => true,
			accessSync: () => undefined,
			statSync: () => ({ isFile: () => false } as fs.Stats),
		};

		assert.strictEqual(CliService.inspectRuntime(context, runtime).status, 'invalid');
		assert.throws(() => CliService.setupCommand([], context, runtime), /invalid/);
	});

	test('rejects unsupported architecture instead of selecting a wrong binary', () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'win32', architecture: 'arm64', env: {}, existsSync: () => true,
			accessSync: () => undefined,
			statSync: () => regularFileStats,
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
			statSync: () => regularFileStats,
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
				statSync: () => regularFileStats,
				readFileHeader: (_candidate: fs.PathLike, length: number) => validPeHeader(length),
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
			statSync: () => regularFileStats,
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
			statSync: () => regularFileStats,
		};
		const calls: Array<{ args: string[]; cwd?: string }> = [];
		let disposed = false;
		const probe = await CliService.probeRuntime(
			CliService.inspectRuntime(context, runtime),
			async (_executable, args, timeoutMs, cwd) => {
				calls.push({ args, cwd });
				assert.strictEqual(timeoutMs, 5000);
				return args[0] === '--version'
					? { stdout: 'wild, version 1.1.0\n', stderr: '' }
					: { stdout: '{"schema_version":"2.0"}', stderr: '' };
			},
			async () => ({ cwd: '/synthetic-repository', dispose: () => { disposed = true; } }),
		);

		assert.deepStrictEqual(calls, [
			{ args: ['--version'], cwd: undefined },
			{ args: ['diff', '--format', 'json'], cwd: '/synthetic-repository' },
		]);
		assert.strictEqual(disposed, true);
		assert.strictEqual(probe.status, 'compatible');
		assert.strictEqual(probe.cliVersion, '1.1.0');
		assert.match(probe.schemaSupport, /schema major 2/);
	});

	for (const artifact of [
		{ name: 'unrelated JSON output', output: '{"format":"json","help":"--format"}', expected: /versioned/ },
		{ name: 'a mismatched schema major', output: '{"schema_version":"3.0"}', expected: /schema major 3/ },
	]) {
		test(`reports an incompatible CLI for ${artifact.name}`, async () => {
			const runtime = {
				platform: 'linux' as NodeJS.Platform, architecture: 'x64', env: {},
				existsSync: () => true,
				accessSync: () => undefined,
				statSync: () => regularFileStats,
			};
			const probe = await CliService.probeRuntime(
				CliService.inspectRuntime(context, runtime),
				async (_executable, args) => args[0] === '--version'
					? { stdout: 'wild, version 1.0.0', stderr: '' }
					: { stdout: artifact.output, stderr: '' },
				async () => ({ cwd: '/synthetic-repository', dispose: () => undefined }),
			);

			assert.strictEqual(probe.status, 'incompatible');
			assert.match(probe.schemaSupport, artifact.expected);
			assert.match(probe.detail, /--format json/);
		});
	}

	test('does not execute a probe when the runtime is missing', async () => {
		let executed = false;
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'darwin', architecture: 'arm64', env: {},
			existsSync: () => false,
			accessSync: () => { throw fileError('ENOENT'); },
			statSync: () => regularFileStats,
		});
		const probe = await CliService.probeRuntime(diagnostics, async () => {
			executed = true;
			return { stdout: '', stderr: '' };
		});

		assert.strictEqual(executed, false);
		assert.strictEqual(probe.status, 'unavailable');
		assert.strictEqual(probe.cliVersion, 'not available');
	});

	test('redacts CLI probe failures', async () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64', env: {},
			existsSync: () => true,
			accessSync: () => undefined,
			statSync: () => regularFileStats,
		});
		const probe = await CliService.probeRuntime(
			diagnostics,
			async () => { throw new Error('secret path and token'); },
		);

		assert.strictEqual(probe.status, 'unavailable');
		assert.doesNotMatch(probe.detail, /secret|token/);
	});

	test('classifies and redacts probe workspace cleanup failures', async () => {
		const diagnostics = CliService.inspectRuntime(context, {
			platform: 'linux', architecture: 'x64', env: {},
			existsSync: () => true,
			accessSync: () => undefined,
			statSync: () => regularFileStats,
		});
		const probe = await CliService.probeRuntime(
			diagnostics,
			async (_executable, args) => args[0] === '--version'
				? { stdout: 'wild, version 1.0.0', stderr: '' }
				: { stdout: '{"schema_version":"2.0"}', stderr: '' },
			async () => ({
				cwd: '/secret/fixture/path',
				dispose: () => { throw new Error('locked secret fixture'); },
			}),
		);

		assert.strictEqual(probe.status, 'unavailable');
		assert.strictEqual(probe.cliVersion, 'unknown');
		assert.doesNotMatch(probe.detail, /secret|fixture|locked/);
	});

});
