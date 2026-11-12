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
import { buildHtmlDiffArgs, buildJsonDiffArgs, DiffService, matchesRendererArtifact } from '../services/DiffService';
import { DiffGraphViewProvider } from '../providers/DiffGraphViewProvider';
import { DiffGraphCache } from '../services/DiffGraphCache';
import { GitService } from '../services/GitService';

suite('DiffService Test Suite', () => {
	let mockContext: vscode.ExtensionContext;

	setup(() => {
		mockContext = {
			extensionPath: '/mock/extension/path',
			subscriptions: [],
		} as unknown as vscode.ExtensionContext;
	});

	test('DiffService can be instantiated', () => {
		const diffService = new DiffService(mockContext);
		assert.ok(diffService);
	});

	test('DiffService can be instantiated with provider', () => {
		const mockProvider = {
			showLoadingScreen: async () => {},
			showDiffGraph: async (htmlPath: string) => {}
		} as unknown as DiffGraphViewProvider;
		
		const diffService = new DiffService(mockContext, mockProvider);
		assert.ok(diffService);
	});

	test('working tree requests explicitly select HTML output', () => {
		assert.deepStrictEqual(
			buildHtmlDiffArgs('/tmp/unstaged.html', { kind: 'working-tree', staged: false }),
			['diff', '--format', 'html', '--output', '/tmp/unstaged.html', '--no-open']
		);
		assert.deepStrictEqual(
			buildHtmlDiffArgs('/tmp/staged.html', { kind: 'working-tree', staged: true }),
			['diff', '--format', 'html', '--output', '/tmp/staged.html', '--no-open', '--staged']
		);
	});

	test('working tree JSON preview requests retain stage semantics without browser launching', () => {
		assert.deepStrictEqual(
			buildJsonDiffArgs('/tmp/staged.json', { kind: 'working-tree', staged: true }),
			['diff', '--format', 'json', '--output', '/tmp/staged.json', '--staged']
		);
	});

	test('cached artifacts match only their active renderer mode', () => {
		assert.strictEqual(matchesRendererArtifact('/tmp/diff.html', false), true);
		assert.strictEqual(matchesRendererArtifact('/tmp/diff.json', true), true);
		assert.strictEqual(matchesRendererArtifact('/tmp/diff.html', true), false);
		assert.strictEqual(matchesRendererArtifact('/tmp/diff.json', false), false);
	});

	test('missing replacement output replaces a loading screen with an error while preserving an existing graph', async () => {
		let generationError: string | undefined;
		const mockProvider = {
			showGenerationError: (message: string) => { generationError = message; },
		} as unknown as DiffGraphViewProvider;
		const diffService = new DiffService(mockContext, mockProvider);

		await assert.rejects(
			() => (diffService as any).showWebviewWithContent('/tmp/wildestai-missing-output.html', 'unstaged'),
			/DiffGraph output was not created/,
		);
		assert.match(generationError ?? '', /DiffGraph output was not created/);
	});

	test('Git repository state changes invalidate cached DiffGraphs without refetching', async () => {
		const repoRoot = '/path/to/repo';
		const cache = DiffGraphCache.getInstance();
		cache.set(repoRoot, 'staged', '/tmp/staged.html');
		cache.set(repoRoot, 'unstaged', '/tmp/unstaged.html');
		let onStateChange: (() => void) | undefined;
		const original = GitService.onDidChangeRepositoryState;
		(GitService as any).onDidChangeRepositoryState = async (_root: string, listener: () => void) => {
			onStateChange = listener;
			return { dispose: () => {} };
		};

		try {
			const diffService = new DiffService(mockContext);
			(diffService as any).watchRepositoryState(mockContext, repoRoot);
			await Promise.resolve();
			assert.ok(onStateChange, 'repository state watcher should be registered');
			onStateChange!();
			assert.strictEqual(cache.has(repoRoot, 'staged'), false);
			assert.strictEqual(cache.has(repoRoot, 'unstaged'), false);
		} finally {
			(GitService as any).onDidChangeRepositoryState = original;
		}
	});

	test('commit requests explicitly select HTML output without changing the range', () => {
		const commitHash = 'a'.repeat(40);
		assert.deepStrictEqual(
			buildHtmlDiffArgs('/tmp/commit.html', { kind: 'commit', commitHash }),
			[
				'diff',
				`${commitHash}~1..${commitHash}`,
				'--format',
				'html',
				'--output',
				'/tmp/commit.html',
				'--no-open'
			]
		);
	});
});
