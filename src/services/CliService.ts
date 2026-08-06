import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { CliCommand, CliOutput } from '../utils/types';

export type CliRuntimeStatus = 'ready' | 'missing' | 'unsupported';

export interface CliRuntimeDiagnostics {
	source: 'development environment' | 'packaged binary';
	status: CliRuntimeStatus;
	platform: string;
	architecture: string;
	executable?: string;
	detail: string;
}

export interface RuntimeEnvironment {
	platform: NodeJS.Platform;
	architecture: string;
	env: NodeJS.ProcessEnv;
	existsSync: (candidate: fs.PathLike) => boolean;
	accessSync: (candidate: fs.PathLike, mode?: number) => void;
}

export class CliService {
	public static inspectRuntime(
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment = this.getRuntimeEnvironment()
	): CliRuntimeDiagnostics {
		const isDevMode = runtime.env.WILDEST_DEV_MODE === '1' ||
			runtime.env.NODE_ENV === 'development';

		if (isDevMode) {
			const { venvPath, executable } = this.resolveDevRuntime(context, runtime);
			const ready = runtime.existsSync(venvPath) && this.isExecutable(executable, runtime);

			return {
				source: 'development environment',
				status: ready ? 'ready' : 'missing',
				platform: runtime.platform,
				architecture: runtime.architecture,
				executable,
				detail: ready
					? 'The configured development CLI is available.'
					: 'The configured virtual environment or wild executable is missing. Set WILDEST_VENV_PATH to a valid environment.',
			};
		}

		const { binaryName, executable } = this.resolveProdRuntime(context, runtime);
		if (!binaryName) {
			return {
				source: 'packaged binary',
				status: 'unsupported',
				platform: runtime.platform,
				architecture: runtime.architecture,
				detail: `No packaged WildestAI CLI is available for ${runtime.platform}/${runtime.architecture}.`,
			};
		}

		const ready = this.isExecutable(executable, runtime);
		return {
			source: 'packaged binary',
			status: ready ? 'ready' : 'missing',
			platform: runtime.platform,
			architecture: runtime.architecture,
			executable,
			detail: ready
				? 'The packaged CLI is available.'
				: `The packaged CLI is missing. Install a release that includes ${binaryName} in the extension bin directory.`,
		};
	}

	public static setupCommand(
		args: string[] = [],
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment = this.getRuntimeEnvironment(),
	): CliCommand {
		const env = Object.assign({}, runtime.env);
		const isDevMode = runtime.env.WILDEST_DEV_MODE === '1' ||
			runtime.env.NODE_ENV === 'development';

		if (isDevMode) {
			return this.getDevCommand(args, env, context, runtime);
		} else {
			return this.getProdCommand(args, env, context, runtime);
		}
	}

	public static async execute(
		command: CliCommand,
		repoRoot: string,
		progress?: vscode.Progress<{ message: string }>
	): Promise<CliOutput> {
		let cliStdout = '', cliStderr = '';
		const startTime = Date.now();
		let interval: NodeJS.Timeout | undefined = undefined;
		let lastCliLine = '';

		interval = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const mins = Math.floor(elapsed / 60);
			const secs = elapsed % 60;
			const elapsedStr = `Elapsed: ${mins}:${secs.toString().padStart(2, '0')}`;
			const message = lastCliLine ? `${elapsedStr} | ${lastCliLine}` : elapsedStr;
			progress?.report({ message });
		}, 1000);

		try {
			await new Promise((resolve, reject) => {
				const child = cp.spawn(command.executable, command.args, {
					cwd: repoRoot,
					env: command.env
				});

				child.stdout.setEncoding('utf8');
				child.stderr.setEncoding('utf8');

				child.stdout.on('data', (data: string) => {
					cliStdout += data;
					const lines = data.split(/\r?\n/).filter(Boolean);
					if (lines.length > 0) {
						lastCliLine = lines[lines.length - 1];
					}
				});

				child.stderr.on('data', (data: string) => {
					cliStderr += data;
					const lines = data.split(/\r?\n/).filter(Boolean);
					if (lines.length > 0) {
						lastCliLine = lines[lines.length - 1];
					}
				});

				child.on('error', reject);
				child.on('close', (code: number) => {
					code === 0 ? resolve(undefined) : reject(new Error(`wild exited with code ${code}`));
				});
			});
		} finally {
			if (interval) { clearInterval(interval); }
		}

		return { stdout: cliStdout, stderr: cliStderr };
	}

	private static getDevCommand(
		args: string[] = [],
		env: NodeJS.ProcessEnv,
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment,
	): CliCommand {
		const { venvPath, binDir, executable } = this.resolveDevRuntime(context, runtime);
		if (!runtime.existsSync(venvPath) || !this.isExecutable(executable, runtime)) {
			throw new Error(`Virtual environment not found or invalid at path: ${venvPath}. Please set WILDEST_VENV_PATH environment variable to point to a valid virtual environment.`);
		}
		const venvBin = path.join(venvPath, binDir);
		env = Object.assign({}, env, {
			PATH: `${venvBin}${path.delimiter}${env.PATH}`,
			VIRTUAL_ENV: venvPath
		});
		return {
			executable,
			args: args,
			env
		};
	}

	private static resolveDevRuntime(
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment,
	): { venvPath: string; binDir: string; executable: string } {
		const defaultVenvPath = path.resolve(context.extensionPath, '..', 'DiffGraph-CLI', '.venv');
		const venvPath = runtime.env.WILDEST_VENV_PATH || defaultVenvPath;
		const isWindows = runtime.platform === 'win32';
		const binDir = isWindows ? 'Scripts' : 'bin';
		const executable = path.join(venvPath, binDir, isWindows ? 'wild.exe' : 'wild');
		return { venvPath, binDir, executable };
	}

	private static isExecutable(candidate: fs.PathLike, runtime: RuntimeEnvironment): boolean {
		if (!runtime.existsSync(candidate)) {
			return false;
		}
		try {
			runtime.accessSync(candidate, fs.constants.X_OK);
			return true;
		} catch {
			return false;
		}
	}

	private static getRuntimeEnvironment(): RuntimeEnvironment {
		return {
			platform: os.platform(),
			architecture: os.arch(),
			env: process.env,
			existsSync: fs.existsSync,
			accessSync: fs.accessSync,
		};
	}

	private static getProdCommand(
		args: string[] = [],
		env: NodeJS.ProcessEnv,
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment,
	): CliCommand {
		const { binaryName, executable } = this.resolveProdRuntime(context, runtime);
		if (!binaryName) {
			throw new Error(`Unsupported platform: ${runtime.platform} ${runtime.architecture}`);
		}
		if (!this.isExecutable(executable, runtime)) {
			throw new Error(`Binary not found or not executable: ${executable}`);
		}
		return {
			executable,
			args: args,
			env
		};
	}

	private static resolveProdRuntime(
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment,
	): { binaryName: string | undefined; executable: string } {
		const binaryName = this.getBinaryName(runtime.platform, runtime.architecture);
		const executable = binaryName ? path.join(context.extensionPath, 'bin', binaryName) : '';
		return { binaryName, executable };
	}

	private static getBinaryName(platform: NodeJS.Platform, arch: string): string | undefined {
		const binaries: Partial<Record<NodeJS.Platform, Record<string, string>>> = {
			darwin: { arm64: 'wild-macos-arm64', x64: 'wild-macos-x64' },
			linux: { arm64: 'wild-linux-arm64', x64: 'wild-linux-x64' },
			win32: { x64: 'wild-win.exe' },
		};

		return binaries[platform]?.[arch];
	}
}
