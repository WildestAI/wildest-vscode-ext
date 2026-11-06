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

/** Compare text consistently across hosts without locale or ICU dependencies. */
function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** Order events newest-first, with a stable code-unit id tie-breaker. */
function compareEvents(left: ProgressEvent, right: ProgressEvent): number {
	const timeOrder = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
	if (timeOrder !== 0) {
		return timeOrder;
	}
	return compareText(left.id, right.id);
}

/** Reject malformed boundary data before cloning or ordering it. */
function validateEvents(events: readonly ProgressEvent[], repositoryIds: ReadonlySet<string>): void {
	const eventIds = new Set<string>();
	for (const event of events) {
		if (typeof event.id !== 'string' || event.id.length === 0) {
			throw new Error('Timeline event has an invalid id');
		}
		if (eventIds.has(event.id)) {
			throw new Error(`Timeline event has a duplicate id: ${event.id}`);
		}
		eventIds.add(event.id);
		if (!repositoryIds.has(event.repositoryId)) {
			throw new Error(`Timeline event references an unknown repository: ${event.repositoryId}`);
		}
		if (typeof event.occurredAt !== 'string' || Number.isNaN(Date.parse(event.occurredAt))) {
			throw new Error(`Timeline event has an invalid timestamp: ${event.id}`);
		}
		if (!event.links || typeof event.links !== 'object' || Array.isArray(event.links)) {
			throw new Error(`Timeline event has invalid links: ${event.id}`);
		}
	}
}

/**
 * Normalize observed local evidence into a stable timeline. No network calls,
 * filesystem reads, or AI inference occur here; failures stay explicit check
 * events and dirty worktrees remain explicit working-tree events.
 */
export function buildProgressTimeline(input: ProgressTimelineInput): ProgressTimeline {
	const repositories = [...input.repositories]
		.map(repository => ({ ...repository }))
		.sort((left, right) => compareText(left.id, right.id));
	const repositoryIds = new Set(repositories.map(repository => repository.id));
	if (input.activeRepositoryId && !repositoryIds.has(input.activeRepositoryId)) {
		throw new Error(`Active repository is not present in timeline input: ${input.activeRepositoryId}`);
	}

	validateEvents(input.events, repositoryIds);

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
