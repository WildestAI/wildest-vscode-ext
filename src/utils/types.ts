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

// DiffGraphCache types
export interface DiffGraphCacheEntry {
	/** Path to the generated HTML file */
	htmlPath: string;
	/** Timestamp when the cache entry was generated */
	generatedAt: number;
}

export type DiffGraphCacheKey = `${string}:staged` | `${string}:unstaged`;

// TreeView node types
export interface ChangesViewNode {
	id: string;
	label: string;
	type: 'root' | 'repo' | 'repoChanges';
	children?: ChangesViewNode[];
	repoPath?: string;
	contextValue?: string;
}
