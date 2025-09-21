// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from './GitService';
import { CliService } from './CliService';
import { DiffGraphCache } from './DiffGraphCache';
import { NotificationService } from './NotificationService';
import { CliCommand } from '../utils/types';
import { DiffGraphViewProvider } from '../providers/DiffGraphViewProvider';

export class DiffService {
	private _outputChannel: vscode.OutputChannel;
	private _notificationService: NotificationService;
	private _cache: DiffGraphCache;
	private _diffGraphViewProvider?: DiffGraphViewProvider;

	constructor(context: vscode.ExtensionContext, diffGraphViewProvider?: DiffGraphViewProvider) {
		this._outputChannel = vscode.window.createOutputChannel('WildestAI');
		this._notificationService = new NotificationService(this._outputChannel);
		this._cache = DiffGraphCache.getInstance();
		this._diffGraphViewProvider = diffGraphViewProvider;
	}

	/**
	 * Opens changes (unstaged) in a webview
	 * Uses cache if available, otherwise generates new content
	 */
	public async openChanges(context: vscode.ExtensionContext, repoPath?: string): Promise<void> {
		await this.openDiffView(context, false, repoPath);
	}

	/**
	 * Opens staged changes in a webview
	 * Uses cache if available, otherwise generates new content
	 */
	public async openStagedChanges(context: vscode.ExtensionContext, repoPath?: string): Promise<void> {
		await this.openDiffView(context, true, repoPath);
	}

	/**
	 * Refreshes changes (unstaged) by invalidating cache and generating new content
	 */
	public async refreshChanges(context: vscode.ExtensionContext, repoPath?: string): Promise<void> {
		await this.refreshDiffView(context, false, repoPath);
	}

	/**
	 * Refreshes staged changes by invalidating cache and generating new content
	 */
	public async refreshStagedChanges(context: vscode.ExtensionContext, repoPath?: string): Promise<void> {
		await this.refreshDiffView(context, true, repoPath);
	}

	/**
	 * Opens a commit diff in a webview (for History view)
	 */
	public async openCommitDiff(context: vscode.ExtensionContext, commitHash: string, repoPath?: string): Promise<void> {
		try {
			const repositories = await GitService.getRepositories();
			const repoRoot = repoPath || repositories[0]?.repoRoot;
			if (!repoRoot) {
				vscode.window.showErrorMessage('No repository found for the commit');
				return;
			}
			const stage = `commit-${commitHash}`;

			// Check cache first
			const cachedEntry = this._cache.get(repoRoot, stage as any);
			if (cachedEntry && fs.existsSync(cachedEntry.htmlPath)) {
				this._outputChannel.appendLine(`Using cached commit diff for ${commitHash}`);
				await this.showWebviewWithContent(cachedEntry.htmlPath, stage);
				return;
			}

			// Generate new content
			await this.generateCommitDiff(context, repoRoot, commitHash);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to open commit diff: ${error.message}`);
		}
	}

	/**
	 * Opens a diff view, using cache if available
	 */
	private async openDiffView(context: vscode.ExtensionContext, staged: boolean, repoPath?: string): Promise<void> {
		try {
			const repositories = await GitService.getRepositories();
			const repoRoot = repoPath || repositories[0]?.repoRoot;
			const stage = staged ? 'staged' : 'unstaged';

			// Check cache first
			const cachedEntry = this._cache.get(repoRoot, stage);
			if (cachedEntry && fs.existsSync(cachedEntry.htmlPath)) {
				this._outputChannel.appendLine(`Using cached ${stage} diff for ${path.basename(repoRoot)}`);
				await this.showWebviewWithContent(cachedEntry.htmlPath, stage);
				return;
			}

			// Generate new content
			await this.generateAndShowDiff(context, repoRoot, stage);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to open ${staged ? 'staged' : 'unstaged'} changes: ${error.message}`);
		}
	}

	/**
	 * Refreshes a diff view by invalidating cache and generating new content
	 */
	private async refreshDiffView(context: vscode.ExtensionContext, staged: boolean, repoPath?: string): Promise<void> {
		try {
			const repositories = await GitService.getRepositories();
			const repoRoot = repoPath || repositories[0]?.repoRoot;
			const stage = staged ? 'staged' : 'unstaged';

			// Invalidate cache
			this._cache.invalidate(repoRoot, stage);
			this._outputChannel.appendLine(`Cache invalidated for ${stage} diff in ${path.basename(repoRoot)}`);

			// Generate new content
			await this.generateAndShowDiff(context, repoRoot, stage);
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to refresh ${staged ? 'staged' : 'unstaged'} changes: ${error.message}`);
		}
	}

	/**
	 * Generates and shows commit diff content, caching the result
	 */
	private async generateCommitDiff(
		context: vscode.ExtensionContext,
		repoRoot: string,
		commitHash: string
	): Promise<void> {
		const startTime = Date.now();
		await this.showLoadingScreen();

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Generating DiffGraph for commit ${commitHash.substring(0, 7)}...`,
			cancellable: false
		}, async (progress) => {
			try {
				// Build temp file path
				const htmlFilePath = this.buildTempFilePath(repoRoot, `commit-${commitHash}`);

				// Call CLI via CliService with commit range
				const args = ['diff', `${commitHash}~1..${commitHash}`, '--output', htmlFilePath, '--no-open'];
				const cliCommand = CliService.setupCommand(args, context);
				const { stdout, stderr } = await CliService.execute(cliCommand, repoRoot, progress);

				// Log output
				const cmdString = `${cliCommand.executable} ${cliCommand.args.join(' ')}`;
				this.logOutput(cmdString, stdout, stderr);

				// Cache the result
				this._cache.set(repoRoot, `commit-${commitHash}` as any, htmlFilePath);

				// Show notification
				this._notificationService.sendOperationComplete(
					`Commit DiffGraph`,
					`${commitHash.substring(0, 7)} in ${path.basename(repoRoot)}`,
					{ startTime }
				);

				// Show content
				await this.showWebviewWithContent(htmlFilePath, `commit-${commitHash}`);
			} catch (error: any) {
				throw error;
			}
		});
	}

	/**
	 * Generates and shows diff content, caching the result
	 */
	private async generateAndShowDiff(
		context: vscode.ExtensionContext,
		repoRoot: string,
		stage: 'staged' | 'unstaged'
	): Promise<void> {
		const startTime = Date.now();
		await this.showLoadingScreen();

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Generating ${stage} DiffGraph for ${path.basename(repoRoot)}...`,
			cancellable: false
		}, async (progress) => {
			try {
				// Build temp file path
				const htmlFilePath = this.buildTempFilePath(repoRoot, stage);

				// Call CLI via CliService
				const args: string[] = ['diff', '--output', htmlFilePath, '--no-open'];
				if (stage === 'staged') {
					args.push('--staged');
				}
				const cliCommand = CliService.setupCommand(args, context);
				const { stdout, stderr } = await CliService.execute(cliCommand, repoRoot, progress);

				// Log output
				const cmdString = `${cliCommand.executable} ${cliCommand.args.join(' ')}`;
				this.logOutput(cmdString, stdout, stderr);

				// Cache the result
				this._cache.set(repoRoot, stage, htmlFilePath);

				// Show notification
				this._notificationService.sendOperationComplete(
					`${stage.charAt(0).toUpperCase() + stage.slice(1)} DiffGraph`,
					path.basename(repoRoot),
					{ startTime }
				);

				// Show content
				await this.showWebviewWithContent(htmlFilePath, stage);
			} catch (error: any) {
				throw error;
			}
		});
	}

	/**
	 * Builds a temporary file path for the HTML output
	 */
	private buildTempFilePath(repoRoot: string, stage: string): string {
		const repoName = path.basename(repoRoot);
		const timestamp = Date.now();
		return path.join(os.tmpdir(), `wildest-${repoName}-${stage}-${timestamp}.html`);
	}

	/**
	 * Shows the loading screen in the webview
	 */
	private async showLoadingScreen(): Promise<void> {
		if (this._diffGraphViewProvider) {
			await this._diffGraphViewProvider.showLoadingScreen();
		}
	}

	/**
	 * Shows the HTML content in the existing diffGraphView webview
	 */
	private async showWebviewWithContent(htmlFilePath: string, stage: string): Promise<void> {
		if (this._diffGraphViewProvider) {
			await this._diffGraphViewProvider.showDiffGraph(htmlFilePath);
		} else {
			vscode.window.showErrorMessage('DiffGraphView provider not available');
		}
	}

	/**
	 * Logs CLI command output
	 */
	private logOutput(command: string, stdout: string, stderr: string): void {
		this._outputChannel.appendLine(`Executed: ${command}`);
		this._outputChannel.appendLine('CLI stdout:\n' + stdout);
		if (stderr) {
			this._outputChannel.appendLine('CLI stderr:\n' + stderr);
		}
		this._outputChannel.show(true);
	}
}
