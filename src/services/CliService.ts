import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { CliCommand, CliOutput } from '../utils/types';

export class CliService {
	public static setupCommand(args: string[] = [], context: vscode.ExtensionContext): CliCommand {
		let env = Object.assign({}, process.env);
		const isDevMode = process.env.WILDEST_DEV_MODE === '1' ||
			process.env.NODE_ENV === 'development';

		if (isDevMode) {
			return this.getDevCommand(args, env);
		} else {
			return this.getProdCommand(args, env, context);
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

	private static getDevCommand(args: string[] = [], env: NodeJS.ProcessEnv): CliCommand {
		const defaultVenvPath = path.join(__dirname, '..', '..', 'DiffGraph-CLI', '.venv');
		const venvPath = process.env.WILDEST_VENV_PATH || defaultVenvPath;
		const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
		if (!fs.existsSync(venvPath) || !fs.existsSync(path.join(venvPath, binDir, 'wild'))) {
			throw new Error(`Virtual environment not found or invalid at path: ${venvPath}. Please set WILDEST_VENV_PATH environment variable to point to a valid virtual environment.`);
		}
		const venvBin = path.join(venvPath, binDir);
		env = Object.assign({}, env, {
			PATH: `${venvBin}${path.delimiter}${env.PATH}`,
			VIRTUAL_ENV: venvPath
		});
		return {
			executable: 'wild',
			args: args,
			env
		};
	}

	private static getProdCommand(
		args: string[] = [],
		env: NodeJS.ProcessEnv,
		context: vscode.ExtensionContext,
	): CliCommand {
		const wildBinary = this.getBinaryPath(context);
		return {
			executable: wildBinary,
			args: args,
			env
		};
	}

	private static getBinaryPath(context: vscode.ExtensionContext): string {
		const platform = os.platform();
		const arch = os.arch();

		let binaryName = '';
		if (platform === 'darwin' && arch === 'arm64') {
			binaryName = 'wild-macos-arm64';
		} else if (platform === 'darwin') {
			binaryName = 'wild-macos-x64';
		} else if (platform === 'linux') {
			binaryName = 'wild-linux-x64';
		} else if (platform === 'win32') {
			binaryName = 'wild-win.exe';
		} else {
			throw new Error(`Unsupported platform: ${platform} ${arch}`);
		}

		const binaryPath = path.join(context.extensionPath, 'bin', binaryName);

		if (!fs.existsSync(binaryPath)) {
			throw new Error(`Binary not found: ${binaryPath}`);
		}

		return binaryPath;
	}
}
