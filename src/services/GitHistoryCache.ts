import { GitCommit } from '../utils/types';

interface CacheEntry {
	commits: GitCommit[];
	graphLines: string[];
	timestamp: number;
}

function cloneCommit(commit: GitCommit): GitCommit {
	return {
		...commit,
		date: new Date(commit.date.getTime()),
		parents: [...commit.parents],
		refs: [...commit.refs],
	};
}

function cloneEntry(entry: Pick<CacheEntry, 'commits' | 'graphLines'>): { commits: GitCommit[]; graphLines: string[] } {
	return {
		commits: entry.commits.map(cloneCommit),
		graphLines: [...entry.graphLines],
	};
}

export class GitHistoryCache {
	private static cache: Map<string, CacheEntry> = new Map();
	private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	public static getCached(repoPath: string): { commits: GitCommit[]; graphLines: string[] } | null {
		const entry = this.cache.get(repoPath);
		if (!entry) { return null; }

		// Check if cache is still valid
		if (Date.now() - entry.timestamp > this.CACHE_TTL) {
			this.cache.delete(repoPath);
			return null;
		}

		return cloneEntry(entry);
	}

	public static update(repoPath: string, commits: GitCommit[], graphLines: string[]): void {
		this.cache.set(repoPath, {
			...cloneEntry({ commits, graphLines }),
			timestamp: Date.now()
		});
	}

	public static invalidate(repoPath: string): void {
		this.cache.delete(repoPath);
	}
}