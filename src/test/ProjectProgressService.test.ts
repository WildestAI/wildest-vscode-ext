import * as assert from 'assert';
import {
	collectProgressTimeline,
	countWorkingTreeChanges,
	LocalGitRunner,
} from '../services/ProjectProgressService';

suite('ProjectProgressService', () => {
	test('counts porcelain records without double-counting rename source paths', () => {
		const porcelain = [
			'M  src/changed.ts',
			'R  src/new-name.ts',
			'src/old-name.ts',
			'?? untracked.ts',
		].join('\0') + '\0';

		assert.strictEqual(countWorkingTreeChanges(porcelain), 3);
	});

	test('collects native-Git commit and working-tree evidence across repositories', async () => {
		const calls: Array<{ repoRoot: string; args: string[] }> = [];
		const runGit: LocalGitRunner = async (repoRoot, args) => {
			calls.push({ repoRoot, args });
			if (args[0] === 'log') {
				return repoRoot === '/workspace/app'
					? ['app-head', '2026-11-19T15:30:00Z', 'Implement local progress'].join('\0')
					: ['docs-head', '2026-11-19T15:00:00Z', 'Document workflow'].join('\0');
			}
			return repoRoot === '/workspace/app'
				? ' M src/extension.ts\0?? notes.md\0'
				: '';
		};

		const timeline = await collectProgressTimeline(
			[
				{ repoRoot: '/workspace/app', name: 'app' },
				{ repoRoot: '/workspace/docs', name: 'docs' },
			],
			runGit,
			() => new Date('2026-11-19T15:31:00Z'),
		);

		assert.deepStrictEqual(calls, [
			{ repoRoot: '/workspace/app', args: ['log', '-1', '--format=%H%x00%aI%x00%s'] },
			{ repoRoot: '/workspace/app', args: ['status', '--porcelain=v1', '-z'] },
			{ repoRoot: '/workspace/docs', args: ['log', '-1', '--format=%H%x00%aI%x00%s'] },
			{ repoRoot: '/workspace/docs', args: ['status', '--porcelain=v1', '-z'] },
		]);
		assert.strictEqual(timeline.privacy, 'local-only');
		assert.strictEqual(timeline.activeRepositoryId, encodeURIComponent('/workspace/app'));
		assert.deepStrictEqual(timeline.events.map(event => [event.kind, event.summary]), [
			['working-tree', '2 uncommitted changes'],
			['commit', 'Implement local progress'],
			['commit', 'Document workflow'],
		]);
		assert.deepStrictEqual(timeline.attention, [{
			eventId: `worktree:${encodeURIComponent('/workspace/app')}`,
			reason: 'uncommitted-changes',
		}]);
	});

	test('keeps repositories with no commits visible while recording dirty evidence', async () => {
		const timeline = await collectProgressTimeline(
			[{ repoRoot: '/workspace/new', name: 'new' }],
			async (_repoRoot, args) => args[0] === 'log' ? '' : '?? README.md\0',
			() => new Date('2026-11-19T15:31:00Z'),
		);

		assert.deepStrictEqual(timeline.repositories, [{ id: encodeURIComponent('/workspace/new'), name: 'new' }]);
		assert.deepStrictEqual(timeline.events.map(event => event.kind), ['working-tree']);
	});
});
