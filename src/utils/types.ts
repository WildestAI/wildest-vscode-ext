import * as vscode from 'vscode';

export interface GitInfo {
	repository: any; // Consider using proper Git extension types
	repoRoot: string;
}

export interface CliCommand {
	cliCmd: string;
	env: NodeJS.ProcessEnv;
}

export interface CliOutput {
	stdout: string;
	stderr: string;
}
