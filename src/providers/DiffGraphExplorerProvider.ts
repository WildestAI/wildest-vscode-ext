import * as vscode from 'vscode';
import * as path from 'path';
import { ChangesViewNode } from '../utils/types';
import { GitService } from '../services/GitService';

export class DiffGraphExplorerProvider implements vscode.TreeDataProvider<ChangesViewNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<ChangesViewNode | undefined | null | void> = new vscode.EventEmitter<ChangesViewNode | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ChangesViewNode | undefined | null | void> = this._onDidChangeTreeData.event;

	private repositories: string[] = [];

	constructor() {
		// Initial load of repositories
		this.updateRepositories();
		setTimeout(() => this.updateRepositories(), 1000);
	}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ChangesViewNode): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.label, this.getCollapsibleState(element));

		treeItem.id = element.id;
		treeItem.contextValue = element.contextValue;

		// Set icons based on node type
		if (element.type === 'repo') {
			treeItem.iconPath = new vscode.ThemeIcon('repo');
		} else if (element.type === 'repoChanges') {
			// Set icon based on repoChanges type
			if (element.contextValue === 'changes') {
				treeItem.iconPath = new vscode.ThemeIcon('diff');
				treeItem.command = {
					command: 'wildestai.openChanges',
					title: 'Show Changes',
					arguments: [element.repoPath]
				};
			} else if (element.contextValue === 'stagedChanges') {
				treeItem.iconPath = new vscode.ThemeIcon('diff-added');
				treeItem.command = {
					command: 'wildestai.openStagedChanges',
					title: 'Show Staged Changes',
					arguments: [element.repoPath]
				};
			}
		}

		return treeItem;
	}

	async getChildren(element?: ChangesViewNode): Promise<ChangesViewNode[]> {
		if (!element) {
			// Root level - return main groups
			return this.getRepositoryNodes();
		}

		if (element.type === 'repo') {
			// Under repository - return Changes and Staged Changes
			return this.getRepoChangesNodes(element.repoPath || '');
		}

		// repoChanges nodes have no children
		return [];
	}

	private getCollapsibleState(element: ChangesViewNode): vscode.TreeItemCollapsibleState {
		if (element.type === 'repoChanges') {
			return vscode.TreeItemCollapsibleState.None;
		}

		return vscode.TreeItemCollapsibleState.Expanded;
	}

	private getRepositoryNodes(): ChangesViewNode[] {
		console.log('WildestAI: getRepositoryNodes called, repositories.length:', this.repositories.length);

		if (this.repositories.length === 0) {
			console.log('WildestAI: No repositories, returning empty array');
			return [];
		}

		if (this.repositories.length === 1) {
			// Single repo - omit repo name level, show repoChanges nodes directly under Changes
			console.log('WildestAI: Single repo, returning repoChanges nodes for:', this.repositories[0]);
			const repoChangesNodes = this.getRepoChangesNodes(this.repositories[0]);
			console.log('WildestAI: Generated repoChanges nodes:', repoChangesNodes);
			return repoChangesNodes;
		}

		// Multiple repos - show repo nodes
		console.log('WildestAI: Multiple repos, returning repo nodes');
		return this.repositories.map((repoPath, index) => {
			const repoName = path.basename(repoPath) || `Repository ${index + 1}`;
			return {
				id: `repo-${index}`,
				label: repoName,
				type: 'repo',
				repoPath: repoPath,
				contextValue: 'repository'
			} as ChangesViewNode;
		});
	}

	private getRepoChangesNodes(repoPath: string): ChangesViewNode[] {
		const repoId = this.repositories.indexOf(repoPath);
		const suffix = this.repositories.length > 1 ? `-${repoId}` : '';

		return [
			{
				id: `staged-changes${suffix}`,
				label: 'Staged Changes',
				type: 'repoChanges',
				repoPath: repoPath,
				contextValue: 'stagedChanges'
			},
			{
				id: `changes${suffix}`,
				label: 'Changes',
				type: 'repoChanges',
				repoPath: repoPath,
				contextValue: 'changes'
			}
		];
	}

	/**
	 * Update repositories and refresh the tree
	 */
	async updateRepositories(): Promise<void> {
		try {
			const repos = await GitService.getRepositories();
			this.repositories = repos.map(({ repoRoot }) => repoRoot);
		} catch (error) {
			if (error instanceof Error && error.message.includes('Timeout waiting for Git')) {
				// If we hit a timeout, schedule another refresh attempt
				console.log('WildestAI: No repositories found:', error);
				this.repositories = [];
				setTimeout(() => this.updateRepositories(), 2000);
			} else {
				throw error;
			}
		}
		this.refresh();
	}
}
