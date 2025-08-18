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

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DiffGraphExplorerProvider } from '../providers/DiffGraphExplorerProvider';
import { ChangesViewNode } from '../utils/types';

suite('DiffGraphExplorerProvider Test Suite', () => {
	let provider: DiffGraphExplorerProvider;

	setup(() => {
		provider = new DiffGraphExplorerProvider();
	});

	test('Provider can be instantiated', () => {
		assert.ok(provider);
		assert.ok(provider.onDidChangeTreeData);
	});

	test('getTreeItem returns correct structure for repo nodes', () => {
		const repoNode: ChangesViewNode = {
			id: 'repo-0',
			label: 'test-repo',
			type: 'repo',
			repoPath: '/path/to/test-repo',
			contextValue: 'repository'
		};

		const treeItem = provider.getTreeItem(repoNode);

		assert.strictEqual(treeItem.label, 'test-repo');
		assert.strictEqual(treeItem.id, 'repo-0');
		assert.strictEqual(treeItem.contextValue, 'repository');
		assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
		assert.ok(treeItem.iconPath);
	});

	test('getTreeItem returns correct command for unstaged changes nodes', () => {
		const changesNode: ChangesViewNode = {
			id: 'changes-0',
			label: 'Changes',
			type: 'repoChanges',
			repoPath: '/path/to/repo',
			contextValue: 'changes'
		};

		const treeItem = provider.getTreeItem(changesNode);

		assert.strictEqual(treeItem.label, 'Changes');
		assert.strictEqual(treeItem.contextValue, 'changes');
		assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
		assert.ok(treeItem.command);
		assert.strictEqual(treeItem.command.command, 'wildestai.openChanges');
		assert.strictEqual(treeItem.command.title, 'Show Changes');
		assert.deepStrictEqual(treeItem.command.arguments, ['/path/to/repo']);
	});

	test('getTreeItem returns correct command for staged changes nodes', () => {
		const stagedChangesNode: ChangesViewNode = {
			id: 'staged-changes-0',
			label: 'Staged Changes',
			type: 'repoChanges',
			repoPath: '/path/to/repo',
			contextValue: 'stagedChanges'
		};

		const treeItem = provider.getTreeItem(stagedChangesNode);

		assert.strictEqual(treeItem.label, 'Staged Changes');
		assert.strictEqual(treeItem.contextValue, 'stagedChanges');
		assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
		assert.ok(treeItem.command);
		assert.strictEqual(treeItem.command.command, 'wildestai.openStagedChanges');
		assert.strictEqual(treeItem.command.title, 'Show Staged Changes');
		assert.deepStrictEqual(treeItem.command.arguments, ['/path/to/repo']);
	});

	test('getChildren returns empty array for repoChanges nodes', async () => {
		const repoChangesNode: ChangesViewNode = {
			id: 'changes-0',
			label: 'Changes',
			type: 'repoChanges',
			repoPath: '/path/to/repo',
			contextValue: 'changes'
		};

		const children = await provider.getChildren(repoChangesNode);
		assert.strictEqual(children.length, 0);
	});

	test('refresh method fires tree data change event', () => {
		let eventFired = false;

		const disposable = provider.onDidChangeTreeData(() => {
			eventFired = true;
		});

		provider.refresh();

		assert.strictEqual(eventFired, true, 'Tree data change event should be fired');
		disposable.dispose();
	});

	test('updateRepositories calls refresh', async () => {
		let refreshCalled = false;

		const originalRefresh = provider.refresh;
		provider.refresh = () => {
			refreshCalled = true;
			originalRefresh.call(provider);
		};

		await provider.updateRepositories();

		assert.strictEqual(refreshCalled, true, 'Refresh should be called during updateRepositories');
		provider.refresh = originalRefresh;
	});
});
