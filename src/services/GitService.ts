import * as vscode from 'vscode';
import * as path from 'path';
import { GitInfo } from '../utils/types';

export class GitService {
	public static async getRepositories(): Promise<GitInfo[]> {
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			throw new Error('Git extension not found. Please ensure Git is enabled in VS Code.');
		}

		const git = gitExtension.isActive
			? gitExtension.exports.getAPI(1)
			: (await gitExtension.activate()).getAPI(1);

		if (!git?.repositories?.length) {
			throw new Error('No Git repositories found in the workspace.');
		}

		return git.repositories.map((repository: any) => {
			const repoRoot = repository.rootUri.fsPath;
			return { repository, repoRoot };
		});
	}

	/**
	 * Get repository path from parameter or user selection
	 */
	public static async getRepositoryPath(treeItemOrRepoPath?: any): Promise<string | undefined> {
		// Extract repoPath from parameter (string or tree item object)
		const repoPath = typeof treeItemOrRepoPath === 'string' ? treeItemOrRepoPath : treeItemOrRepoPath?.repoPath;
		
		if (repoPath) {
			return repoPath;
		}

		// No repoPath provided, show quick pick for user to select
		const repositories = await GitService.getRepositories();
		
		if (repositories.length === 0) {
			vscode.window.showErrorMessage('No Git repositories found');
			return undefined;
		}
		
		if (repositories.length === 1) {
			return repositories[0].repoRoot;
		}

		// Show quick pick for multiple repositories
		const quickPickItems = repositories.map(repo => ({
			label: path.basename(repo.repoRoot),
			description: repo.repoRoot,
			repoPath: repo.repoRoot
		}));

		const selected = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: 'Select a repository'
		});

		return selected?.repoPath;
	}
}
