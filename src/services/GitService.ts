import * as vscode from 'vscode';
import * as path from 'path';
import { GitInfo } from '../utils/types';

export class GitService {
	private static gitAPI: any;
	private static initializationPromise: Promise<void> | undefined;

	private static async waitForGitInitialization(maxAttempts: number = 10, delayMs: number = 1000): Promise<void> {
		if (!this.initializationPromise) {
			this.initializationPromise = this.performGitInitialization(maxAttempts, delayMs);
		}

		return this.initializationPromise;
	}

	private static async performGitInitialization(maxAttempts: number, delayMs: number): Promise<void> {
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			throw new Error('Git extension not found. Please ensure Git is enabled in VS Code.');
		}

		// Activate the extension if it's not already active
		if (!gitExtension.isActive) {
			await gitExtension.activate();
		}

		this.gitAPI = gitExtension.exports.getAPI(1);

		// Subscribe to repository change events
		this.gitAPI.onDidChangeState(() => {
			// State has changed, repositories might be available now
		});

		let attempts = 0;
		const checkRepositories = async (): Promise<void> => {
			if (this.gitAPI.repositories.length > 0) {
				return;
			}

			if (attempts >= maxAttempts) {
				throw new Error('Timeout waiting for Git repositories to be initialized.');
			}

			attempts++;
			await new Promise(r => setTimeout(r, delayMs));
			await checkRepositories();
		};

		await checkRepositories();
	}

	public static async getRepositories(): Promise<GitInfo[]> {
		try {
			await this.waitForGitInitialization();

			if (!this.gitAPI?.repositories?.length) {
				throw new Error('No Git repositories found in the workspace.');
			}

			return this.gitAPI.repositories.map((repository: any) => {
				const repoRoot = repository.rootUri.fsPath;
				return { repository, repoRoot };
			});
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error('Failed to get Git repositories');
		}
	}

	/**
	 * Get repository path from parameter or user selection
	 */
	public static async getRepositoryPath(treeItemOrRepoPath?: string | { repoPath: string }): Promise<string | undefined> {
		// Extract repoPath from parameter (string or tree item object)
		const repoPath = typeof treeItemOrRepoPath === 'string' ? treeItemOrRepoPath : treeItemOrRepoPath?.repoPath;

		if (repoPath) {
			return repoPath;
		}

		// No repoPath provided, show quick pick for user to select
		let repositories: GitInfo[] = [];
		try {
			repositories = await this.getRepositories();
		} catch (err: any) {
			vscode.window.showErrorMessage(err?.message ?? 'No Git repositories found');
			return undefined;
		}

		if (repositories.length === 0) {
			vscode.window.showErrorMessage('No Git repositories found');
			return undefined;
		}

		if (repositories.length === 1) {
			return repositories[0].repoRoot;
		}

		// Show quick pick for multiple repositories
		interface RepoQuickPickItem extends vscode.QuickPickItem {
			repoPath: string;
		}
		const quickPickItems: RepoQuickPickItem[] = repositories.map(repo => ({
			label: path.basename(repo.repoRoot),
			description: repo.repoRoot,
			repoPath: repo.repoRoot
		}));

		const selected = await vscode.window.showQuickPick<RepoQuickPickItem>(quickPickItems, {
			placeHolder: 'Select a repository'
		});

		return selected?.repoPath;
	}
}
