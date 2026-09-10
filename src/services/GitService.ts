import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { GitInfo } from '../utils/types';

const execFileAsync = promisify(execFile);

export class GitService {
	private static gitAPI: any;
	private static initializationPromise: Promise<void> | undefined;
	private static stateChangeDisposable: vscode.Disposable | undefined;

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

		// Dispose previous subscription to prevent memory leaks on re-initialization
		this.stateChangeDisposable?.dispose();

		// Subscribe to repository change events
		this.stateChangeDisposable = this.gitAPI.onDidChangeState(() => {
			// TODO: Future feature - Auto-generate wild diff on git state changes (behind feature flag)
			// When implementing:
			// 1. Add a VSCode extension setting for enabling auto-diff generation
			// 2. Check the feature flag from extension settings
			// 3. If enabled, trigger CliService.generateDiff() for affected repositories
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

	/**
	 * Return a content address for the exact input to a staged or unstaged
	 * DiffGraph. Git's binary diff preserves mode, rename, and blob changes;
	 * unstaged fingerprints additionally include untracked file bytes because
	 * the CLI represents those snapshots too.
	 */
	public static async getDiffContentFingerprint(repoRoot: string, staged: boolean): Promise<string> {
		const args = ['diff', '--binary', '--no-ext-diff'];
		if (staged) {
			args.push('--cached');
		}
		const hash = createHash('sha256');
		hash.update(staged ? 'staged\0' : 'unstaged\0');
		await this.hashGitDiff(repoRoot, args, hash);

		if (!staged) {
			const { stdout: untracked } = await execFileAsync(
				'git', ['ls-files', '--others', '--exclude-standard', '-z'],
				{ cwd: repoRoot, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }
			);
			for (const relativePath of (untracked as Buffer).toString('utf8').split('\0').filter(Boolean).sort()) {
				const filePath = path.resolve(repoRoot, relativePath);
				const relativeToRepo = path.relative(repoRoot, filePath);
				if (
					relativeToRepo === '..' ||
					relativeToRepo.startsWith(`..${path.sep}`) ||
					path.isAbsolute(relativeToRepo)
				) {
					throw new Error(`Git returned an untracked path outside the repository: ${relativePath}`);
				}
				hash.update(relativePath);
				hash.update('\0');
				for await (const chunk of createReadStream(filePath)) {
					hash.update(chunk);
				}
				hash.update('\0');
			}
		}

		return hash.digest('hex');
	}

	/** Stream Git's binary diff directly into a hash to avoid a fixed output limit. */
	private static async hashGitDiff(repoRoot: string, args: string[], hash: ReturnType<typeof createHash>): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const child = spawn('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
			let stderr = '';
			child.stdout.on('data', (chunk: Buffer) => hash.update(chunk));
			child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
			child.once('error', reject);
			child.once('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`git ${args.join(' ')} failed with exit code ${code}: ${stderr.trim()}`));
				}
			});
		});
	}
}
