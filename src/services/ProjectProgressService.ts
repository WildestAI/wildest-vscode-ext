import * as path from 'path';
import { GitService } from './GitService';
import { buildProgressTimeline, ProgressTimeline } from '../utils/progressTimeline';

export type LocalGitRunner = (repoRoot: string, args: string[]) => Promise<string>;

export interface LocalProgressRepository {
	repoRoot: string;
	name: string;
}

/**
 * Count porcelain-v1 records without interpreting user-controlled filenames.
 * With `-z`, rename/copy source paths are separate NUL-delimited fields. Skip
 * each source path by position so a filename resembling a status code is not
 * counted as another change.
 */
export function countWorkingTreeChanges(porcelain: string): number {
	const records = porcelain.split('\0');
	let count = 0;
	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		if (!/^[ MADRCTU?!]{2} /.test(record)) {
			continue;
		}
		count++;
		if (/[RC]/.test(record.slice(0, 2))) {
			index++; // The next field is the rename/copy source path.
		}
	}
	return count;
}

function repositoryId(repoRoot: string): string {
	// This identity stays inside the extension's local-only timeline. Encoding
	// prevents path separators from becoming an accidental structured format.
	return encodeURIComponent(repoRoot);
}

function readHeadRecord(output: string): { hash: string; occurredAt: string; summary: string } | undefined {
	const [hash, occurredAt, summary] = output.split('\0');
	if (!hash || !occurredAt || summary === undefined) {
		return undefined;
	}
	return { hash, occurredAt, summary: summary.trim() || 'Commit with no subject' };
}

function isUnbornHeadError(error: unknown): boolean {
	return error instanceof Error && /does not have any commits yet/i.test(error.message);
}

/**
 * Build observed, local-only project-progress evidence from native Git.
 *
 * No provider, CLI artifact, network request, or task-status inference is
 * involved: this only records the current HEAD and dirty-worktree evidence
 * already available on disk. The injected clock makes the collection boundary
 * reproducible in tests and keeps the model's required timestamps explicit.
 */
export async function collectProgressTimeline(
	repositories: readonly LocalProgressRepository[],
	runGit: LocalGitRunner,
	now: () => Date = () => new Date(),
): Promise<ProgressTimeline> {
	const events: Parameters<typeof buildProgressTimeline>[0]['events'][number][] = [];
	const localRepositories = repositories.map(repository => ({
		id: repositoryId(repository.repoRoot),
		name: repository.name,
	}));

	for (const repository of repositories) {
		const id = repositoryId(repository.repoRoot);
		let headOutput: string | undefined;
		try {
			headOutput = await runGit(repository.repoRoot, ['log', '-1', '--format=%H%x00%aI%x00%s']);
		} catch (error) {
			if (!isUnbornHeadError(error)) {
				throw error;
			}
		}
		const statusOutput = await runGit(repository.repoRoot, ['status', '--porcelain=v1', '-z']);
		const head = headOutput ? readHeadRecord(headOutput) : undefined;
		if (head) {
			events.push({
				id: `commit:${id}:${head.hash}`,
				repositoryId: id,
				kind: 'commit',
				occurredAt: head.occurredAt,
				summary: head.summary,
				links: { commit: head.hash, graphFocus: { commit: head.hash } },
			});
		}

		const changedFileCount = countWorkingTreeChanges(statusOutput);
		if (changedFileCount > 0) {
			events.push({
				id: `worktree:${id}`,
				repositoryId: id,
				kind: 'working-tree',
				occurredAt: now().toISOString(),
				summary: `${changedFileCount} uncommitted ${changedFileCount === 1 ? 'change' : 'changes'}`,
				links: {},
			});
		}
	}

	return buildProgressTimeline({
		repositories: localRepositories,
		activeRepositoryId: localRepositories[0]?.id,
		events,
	});
}

/** Collect progress evidence for every Git repository currently open in VS Code. */
export async function collectWorkspaceProgressTimeline(): Promise<ProgressTimeline> {
	const repositories = await GitService.getRepositories();
	return collectProgressTimeline(
		repositories.map(repository => ({ repoRoot: repository.repoRoot, name: path.basename(repository.repoRoot) })),
		(repoRoot, args) => GitService.runGit(repoRoot, args),
	);
}
