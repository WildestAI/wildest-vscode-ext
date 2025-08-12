import * as vscode from 'vscode';

/** Type definitions for VS Code's Git extension API */
interface GitExtensionAPI {
	repositories: GitRepository[];
}

/** Represents a Git repository from VS Code's Git extension */
interface GitRepository {
	rootUri: vscode.Uri;
}
export interface GitInfo {
	repository: GitRepository;
	repoRoot: string;
}

export interface CliCommand {
	executable: string;
	args: string[];
	env: NodeJS.ProcessEnv;
}

export interface CliOutput {
	stdout: string;
	stderr: string;
}
