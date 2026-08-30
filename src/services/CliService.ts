import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { CliCommand, CliOutput } from '../utils/types';
import { DiffGraphContractError, validateDiffGraphArtifact } from '../utils/diffGraphV2';

export type CliRuntimeStatus = 'ready' | 'missing' | 'permission-denied' | 'invalid' | 'unsupported';
export type CliCompatibilityStatus = 'compatible' | 'incompatible' | 'unavailable';

export interface CliRuntimeDiagnostics {
	source: 'development environment' | 'packaged binary';
	status: CliRuntimeStatus;
	platform: string;
	architecture: string;
	executable?: string;
	detail: string;
}

export interface CliRuntimeProbe {
	status: CliCompatibilityStatus;
	cliVersion: string;
	schemaSupport: string;
	detail: string;
}

export type CliProbeExecutor = (
	executable: string,
	args: string[],
	timeoutMs: number,
	cwd?: string,
) => Promise<{ stdout: string; stderr: string }>;

export interface CliProbeWorkspace {
	cwd: string;
	dispose: () => void;
}

export type CliProbeWorkspaceFactory = () => Promise<CliProbeWorkspace>;

export interface RuntimeEnvironment {
	platform: NodeJS.Platform;
	architecture: string;
	env: NodeJS.ProcessEnv;
	existsSync: (candidate: fs.PathLike) => boolean;
	accessSync: (candidate: fs.PathLike, mode?: number) => void;
	statSync: (candidate: fs.PathLike) => fs.Stats;
	readFileHeader?: (candidate: fs.PathLike, length: number) => Buffer;
}

export class CliService {
	private static readonly supportedSchemaMajor = 2;

	public static inspectRuntime(
		context: vscode.ExtensionContext,
		runtime: RuntimeEnvironment = this.getRuntimeEnvironment()
	): CliRuntimeDiagnostics {
		const isDevMode = runtime.env.WILDEST_DEV_MODE === '1' ||
			runtime.env.NODE_ENV === 'development';

		if (isDevMode) {
			const { venvPath, executable } = this.resolveDevRuntime(context, runtime);
			const venvStatus = this.inspectPath(venvPath, runtime);
			if (venvStatus !== 'ready') {
				return {
					source: 'development environment',
					status: venvStatus,
					platform: runtime.platform,
					architecture: runtime.architecture,
					executable,
					detail: venvStatus === 'permission-denied'
						? `The configured virtual environment cannot be accessed at ${venvPath}. Restore directory permissions or set WILDEST_VENV_PATH to an accessible environment.`
						: venvStatus === 'missing'
							? `The configured virtual environment is missing at ${venvPath}. Set WILDEST_VENV_PATH to a valid environment.`
							: `The configured virtual environment could not be validated at ${venvPath}. Set WILDEST_VENV_PATH to a valid environment.`,
				};
			}

			const status = this.inspectLaunchability(executable, runtime);
			return {
				source: 'development environment',
				status,
				platform: runtime.platform,
				architecture: runtime.architecture,
				executable,
				detail: status === 'ready'
					? 'The configured development CLI is available.'
					: status === 'permission-denied'
						? 'The configured wild executable exists but cannot be executed. Restore execute permission for the file or recreate the virtual environment.'
						: status === 'missing'
							? `The configured wild executable is missing at ${executable}. Recreate the virtual environment.`
							: 'The configured wild executable is not a launchable file or could not be validated. Recreate the virtual environment.',
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

		const status = this.inspectLaunchability(executable, runtime);
		return {
			source: 'packaged binary',
			status,
			platform: runtime.platform,
			architecture: runtime.architecture,
			executable,
			detail: status === 'ready'
				? 'The packaged CLI is available.'
				: status === 'permission-denied'
					? `The packaged CLI ${binaryName} exists but cannot be executed. Reinstall the extension; on macOS/Linux, verify that the file has execute permission.`
					: status === 'missing'
						? `The packaged CLI is missing. Install a release that includes ${binaryName} in the extension bin directory.`
						: `The packaged CLI ${binaryName} is not a launchable file or could not be validated. Reinstall the extension.`,
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

	public static async probeRuntime(
		diagnostics: CliRuntimeDiagnostics,
		executeProbe: CliProbeExecutor = this.executeProbe,
		createWorkspace: CliProbeWorkspaceFactory = this.createProbeWorkspace,
	): Promise<CliRuntimeProbe> {
		if (diagnostics.status !== 'ready' || !diagnostics.executable) {
			return {
				status: 'unavailable',
				cliVersion: 'not available',
				schemaSupport: 'not checked',
				detail: diagnostics.detail,
			};
		}

		let workspace: CliProbeWorkspace | undefined;
		let result: CliRuntimeProbe;
		try {
			const versionResult = await executeProbe(diagnostics.executable, ['--version'], 5000);
			const versionOutput = `${versionResult.stdout}\n${versionResult.stderr}`;
			const version = versionOutput.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0] || 'unknown';
			workspace = await createWorkspace();
			const artifactResult = await executeProbe(
				diagnostics.executable,
				['diff', '--format', 'json'],
				5000,
				workspace.cwd,
			);
			const artifact = JSON.parse(artifactResult.stdout) as { schema_version?: unknown };
			const schemaVersion = typeof artifact.schema_version === 'string'
				? artifact.schema_version.match(/^(\d+)\.\d+$/)
				: undefined;
			const schemaMajor = schemaVersion ? Number(schemaVersion[1]) : undefined;
			const compatible = schemaMajor === this.supportedSchemaMajor;

			if (!compatible) {
				result = {
					status: 'incompatible',
					cliVersion: version,
					schemaSupport: schemaMajor === undefined
						? 'The CLI did not return a versioned DiffGraph JSON artifact'
						: `CLI returned DiffGraph schema major ${schemaMajor}; extension requires ${this.supportedSchemaMajor}`,
					detail: 'Install a CLI version that produces wild diff --format json with a compatible schema major.',
				};
			} else {
				try {
					validateDiffGraphArtifact(artifact);
					result = {
						status: 'compatible',
						cliVersion: version,
						schemaSupport: `Validated deterministic DiffGraph JSON schema major ${schemaMajor}`,
						detail: 'The CLI produced a valid, compatible artifact from an isolated synthetic Git fixture.',
					};
				} catch (error) {
					if (!(error instanceof DiffGraphContractError)) { throw error; }
					result = {
						status: 'incompatible',
						cliVersion: version,
						schemaSupport: `CLI returned an invalid DiffGraph schema-v${this.supportedSchemaMajor} artifact`,
						detail: 'Install a CLI version that produces a complete, compatible wild diff --format json artifact.',
					};
				}
			}
		} catch {
			result = {
				status: 'unavailable',
				cliVersion: 'unknown',
				schemaSupport: 'not checked',
				detail: 'The CLI health probe failed or timed out. Run the selected executable with --version and test wild diff --format json in a Git repository.',
			};
		}

		try {
			workspace?.dispose();
		} catch {
			return {
				status: 'unavailable',
				cliVersion: 'unknown',
				schemaSupport: 'not checked',
				detail: 'The CLI health probe failed or timed out. Run the selected executable with --version and test wild diff --format json in a Git repository.',
			};
		}
		return result;
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
		const venvStatus = this.inspectPath(venvPath, runtime);
		if (venvStatus !== 'ready') {
			throw new Error(venvStatus === 'permission-denied'
				? `Virtual environment cannot be accessed at path: ${venvPath}. Please restore directory permissions or set WILDEST_VENV_PATH to an accessible virtual environment.`
				: `Virtual environment not found or invalid at path: ${venvPath}. Please set WILDEST_VENV_PATH environment variable to point to a valid virtual environment.`);
		}
		const executableStatus = this.inspectLaunchability(executable, runtime);
		if (executableStatus !== 'ready') {
			throw new Error(executableStatus === 'permission-denied'
				? `Wild executable cannot be executed at path: ${executable}. Restore execute permission or recreate the virtual environment.`
				: executableStatus === 'missing'
					? `Wild executable is missing at path: ${executable}. Recreate the virtual environment.`
					: `Wild executable is invalid at path: ${executable}. Recreate the virtual environment.`);
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

	private static inspectPath(
		candidate: fs.PathLike,
		runtime: RuntimeEnvironment,
	): Exclude<CliRuntimeStatus, 'unsupported'> {
		try {
			runtime.statSync(candidate);
			return 'ready';
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'EACCES' || code === 'EPERM') {
				return 'permission-denied';
			}
			if (code === 'ENOENT' || code === 'ENOTDIR') {
				return 'missing';
			}
			return 'invalid';
		}
	}

	private static inspectLaunchability(
		candidate: fs.PathLike,
		runtime: RuntimeEnvironment,
	): Exclude<CliRuntimeStatus, 'unsupported'> {
		try {
			if (runtime.platform === 'win32') {
				runtime.accessSync(candidate, fs.constants.R_OK);
				const readHeader = runtime.readFileHeader ?? this.readFileHeader;
				const dosHeader = readHeader(candidate, 0x40);
				if (dosHeader.length < 0x40 || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
					return 'invalid';
				}
				const peOffset = dosHeader.readUInt32LE(0x3c);
				if (peOffset < 0x40 || peOffset > 1024 * 1024 - 4) {
					return 'invalid';
				}
				const peHeader = readHeader(candidate, peOffset + 4);
				return peHeader.length >= peOffset + 4 &&
					peHeader.subarray(peOffset, peOffset + 4).equals(Buffer.from('PE\0\0'))
					? 'ready'
					: 'invalid';
			}
			runtime.accessSync(candidate, fs.constants.X_OK);
			return runtime.statSync(candidate).isFile() ? 'ready' : 'invalid';
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'EACCES' || code === 'EPERM') {
				return 'permission-denied';
			}
			if (code === 'ENOENT' || code === 'ENOTDIR') {
				return 'missing';
			}
			return 'invalid';
		}
	}

	private static readFileHeader(candidate: fs.PathLike, length: number): Buffer {
		const descriptor = fs.openSync(candidate, 'r');
		try {
			const header = Buffer.alloc(length);
			const bytesRead = fs.readSync(descriptor, header, 0, length, 0);
			return header.subarray(0, bytesRead);
		} finally {
			fs.closeSync(descriptor);
		}
	}

	private static getRuntimeEnvironment(): RuntimeEnvironment {
		return {
			platform: os.platform(),
			architecture: os.arch(),
			env: process.env,
			existsSync: fs.existsSync,
			accessSync: fs.accessSync,
			statSync: fs.statSync,
			readFileHeader: this.readFileHeader,
		};
	}

	private static executeProbe: CliProbeExecutor = (executable, args, timeoutMs, cwd) =>
		new Promise((resolve, reject) => {
			cp.execFile(executable, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve({ stdout, stderr });
			});
		});

	private static createProbeWorkspace: CliProbeWorkspaceFactory = async () => {
		const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wildestai-runtime-probe-'));
		try {
			await CliService.executeProbe('git', ['init', '--quiet'], 5000, cwd);
			const fixture = path.join(cwd, 'probe.txt');
			await fs.promises.writeFile(fixture, 'before\n', 'utf8');
			await CliService.executeProbe('git', ['add', 'probe.txt'], 5000, cwd);
			await fs.promises.writeFile(fixture, 'after\n', 'utf8');
			return {
				cwd,
				dispose: () => fs.rmSync(cwd, { recursive: true, force: true }),
			};
		} catch (error) {
			fs.rmSync(cwd, { recursive: true, force: true });
			throw error;
		}
	};

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
		const status = this.inspectLaunchability(executable, runtime);
		if (status !== 'ready') {
			throw new Error(status === 'permission-denied'
				? `Packaged CLI is not executable: ${executable}. Reinstall the extension and verify execute permission.`
				: status === 'missing'
					? `Packaged CLI is missing: ${executable}. Reinstall the extension.`
					: `Packaged CLI is invalid: ${executable}. Reinstall the extension.`);
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
