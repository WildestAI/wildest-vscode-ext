/**
 * Versioned, local-only input for the Project Progress overview.
 *
 * This deliberately models observed Git and check evidence instead of inferred
 * task status. The caller owns collection; this module only normalizes it into
 * a deterministic, read-only timeline that can later be rendered by a view.
 */
export const PROGRESS_TIMELINE_VERSION = 1 as const;

export type ProgressCheckStatus = 'passed' | 'failed' | 'running' | 'unknown';
export type ProgressEventKind = 'working-tree' | 'commit' | 'check';

export interface ProgressRepository {
	/** Stable workspace-local repository identifier; callers must not upload it. */
	id: string;
	name: string;
}

export interface ProgressLink {
	file?: string;
	commit?: string;
	diff?: { base: string; head: string };
	graphFocus?: { commit?: string; paths?: string[] };
}

export interface ProgressEvent {
	id: string;
	repositoryId: string;
	kind: ProgressEventKind;
	occurredAt: string;
	summary: string;
	links: ProgressLink;
	checkStatus?: ProgressCheckStatus;
}

export interface ProgressTimelineInput {
	repositories: readonly ProgressRepository[];
	activeRepositoryId?: string;
	events: readonly ProgressEvent[];
	/** The commit a developer last reviewed, when the host can supply it. */
	lastReviewedCommit?: string;
}

export interface ProgressAttentionItem {
	eventId: string;
	reason: 'failed-check' | 'uncommitted-changes';
}

export interface ProgressTimeline {
	version: typeof PROGRESS_TIMELINE_VERSION;
	privacy: 'local-only';
	repositories: readonly ProgressRepository[];
	activeRepositoryId?: string;
	events: readonly ProgressEvent[];
	attention: readonly ProgressAttentionItem[];
	lastReviewedCommit?: string;
}

function compareEvents(left: ProgressEvent, right: ProgressEvent): number {
	const timeOrder = right.occurredAt.localeCompare(left.occurredAt);
	if (timeOrder !== 0) {
		return timeOrder;
	}
	return left.id.localeCompare(right.id);
}

/**
 * Normalize observed local evidence into a stable timeline. No network calls,
 * filesystem reads, or AI inference occur here; failures stay explicit check
 * events and dirty worktrees remain explicit working-tree events.
 */
export function buildProgressTimeline(input: ProgressTimelineInput): ProgressTimeline {
	const repositories = [...input.repositories]
		.map(repository => ({ ...repository }))
		.sort((left, right) => left.id.localeCompare(right.id));
	const repositoryIds = new Set(repositories.map(repository => repository.id));
	if (input.activeRepositoryId && !repositoryIds.has(input.activeRepositoryId)) {
		throw new Error(`Active repository is not present in timeline input: ${input.activeRepositoryId}`);
	}

	const events = [...input.events]
		.map(event => ({
			...event,
			links: {
				...event.links,
				diff: event.links.diff ? { ...event.links.diff } : undefined,
				graphFocus: event.links.graphFocus
					? { ...event.links.graphFocus, paths: event.links.graphFocus.paths ? [...event.links.graphFocus.paths] : undefined }
					: undefined,
			},
		}))
		.sort(compareEvents);

	for (const event of events) {
		if (!repositoryIds.has(event.repositoryId)) {
			throw new Error(`Timeline event references an unknown repository: ${event.repositoryId}`);
		}
		if (Number.isNaN(Date.parse(event.occurredAt))) {
			throw new Error(`Timeline event has an invalid timestamp: ${event.id}`);
		}
	}

	const attention: ProgressAttentionItem[] = [];
	for (const event of events) {
		if (event.kind === 'check' && event.checkStatus === 'failed') {
			attention.push({ eventId: event.id, reason: 'failed-check' });
		} else if (event.kind === 'working-tree') {
			attention.push({ eventId: event.id, reason: 'uncommitted-changes' });
		}
	}

	return {
		version: PROGRESS_TIMELINE_VERSION,
		privacy: 'local-only',
		repositories,
		activeRepositoryId: input.activeRepositoryId,
		events,
		attention,
		lastReviewedCommit: input.lastReviewedCommit,
	};
}
