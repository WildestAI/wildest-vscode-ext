import * as assert from 'assert';
import {
	buildProgressTimeline,
	PROGRESS_TIMELINE_VERSION,
	ProgressTimelineInput,
} from '../utils/progressTimeline';

const input: ProgressTimelineInput = {
	repositories: [
		{ id: 'docs', name: 'docs' },
		{ id: 'extension', name: 'extension' },
	],
	activeRepositoryId: 'extension',
	lastReviewedCommit: 'abc123',
	events: [
		{
			id: 'check:extension:test',
			repositoryId: 'extension',
			kind: 'check',
			occurredAt: '2026-11-06T04:00:00.000Z',
			summary: 'npm test failed',
			checkStatus: 'failed',
			links: { file: 'src/test/progressTimeline.test.ts' },
		},
		{
			id: 'commit:extension:def456',
			repositoryId: 'extension',
			kind: 'commit',
			occurredAt: '2026-11-06T03:00:00.000Z',
			summary: 'Add deterministic timeline',
			links: { commit: 'def456', diff: { base: 'abc123', head: 'def456' }, graphFocus: { paths: ['src/utils/progressTimeline.ts'] } },
		},
		{
			id: 'worktree:docs',
			repositoryId: 'docs',
			kind: 'working-tree',
			occurredAt: '2026-11-06T05:00:00.000Z',
			summary: '1 uncommitted change',
			links: { file: 'README.md' },
		},
	],
};

suite('Progress timeline model', () => {
	test('produces a versioned, local-only deterministic timeline from observed evidence', () => {
		const timeline = buildProgressTimeline(input);

		assert.strictEqual(timeline.version, PROGRESS_TIMELINE_VERSION);
		assert.strictEqual(timeline.privacy, 'local-only');
		assert.strictEqual(timeline.activeRepositoryId, 'extension');
		assert.strictEqual(timeline.lastReviewedCommit, 'abc123');
		assert.deepStrictEqual(timeline.repositories.map(repository => repository.id), ['docs', 'extension']);
		assert.deepStrictEqual(timeline.events.map(event => event.id), [
			'worktree:docs',
			'check:extension:test',
			'commit:extension:def456',
		]);
		assert.deepStrictEqual(timeline.attention, [
			{ eventId: 'worktree:docs', reason: 'uncommitted-changes' },
			{ eventId: 'check:extension:test', reason: 'failed-check' },
		]);
	});

	test('does not retain mutable caller-owned evidence', () => {
		const timeline = buildProgressTimeline(input);
		input.events[1].links.graphFocus!.paths!.push('mutated.ts');
		input.events[1].links.diff!.head = 'mutated';

		const commitEvent = timeline.events.find(event => event.id === 'commit:extension:def456')!;
		assert.deepStrictEqual(commitEvent.links.graphFocus!.paths, ['src/utils/progressTimeline.ts']);
		assert.strictEqual(commitEvent.links.diff!.head, 'def456');
	});

	test('rejects events without a local repository context', () => {
		assert.throws(() => buildProgressTimeline({
			repositories: [{ id: 'extension', name: 'extension' }],
			events: [{
			id: 'commit:unknown', repositoryId: 'unknown', kind: 'commit', occurredAt: '2026-11-06T00:00:00.000Z', summary: 'Unknown repo', links: {},
		}],
		}), /unknown repository/);
	});

	test('rejects malformed boundary evidence before cloning or sorting it', () => {
		assert.throws(() => buildProgressTimeline({
			repositories: [{ id: 'extension', name: 'extension' }],
			activeRepositoryId: 'missing',
			events: [],
		}), /Active repository/);
		assert.throws(() => buildProgressTimeline({
			repositories: [{ id: 'extension', name: 'extension' }],
			events: [{
				id: 'commit:bad-time', repositoryId: 'extension', kind: 'commit', occurredAt: 'not-a-date', summary: 'Bad timestamp', links: {},
			}],
		}), /invalid timestamp/);
		assert.throws(() => buildProgressTimeline({
			repositories: [{ id: 'extension', name: 'extension' }],
			events: [{
				id: 'commit:bad-links', repositoryId: 'extension', kind: 'commit', occurredAt: '2026-11-06T00:00:00.000Z', summary: 'Missing links', links: null as unknown as Record<string, never>,
			}],
		}), /invalid links/);
	});

	test('orders equivalent instants by id even when timestamp offsets differ', () => {
		const timeline = buildProgressTimeline({
			repositories: [{ id: 'extension', name: 'extension' }],
			events: [
				{ id: 'z-event', repositoryId: 'extension', kind: 'commit', occurredAt: '2026-11-06T01:00:00+01:00', summary: 'Z', links: {} },
				{ id: 'A-event', repositoryId: 'extension', kind: 'commit', occurredAt: '2026-11-06T00:00:00Z', summary: 'A', links: {} },
			],
		});
		assert.deepStrictEqual(timeline.events.map(event => event.id), ['A-event', 'z-event']);
	});
});
