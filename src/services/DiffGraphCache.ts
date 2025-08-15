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

import { DiffGraphCacheEntry, DiffGraphCacheKey } from '../utils/types';

/**
 * In-memory cache for DiffGraph HTML content
 * Keyed by `{repoRoot}:{staged|unstaged}` format
 */

export class DiffGraphCache {
    private static _instance: DiffGraphCache;
    private _cache: Map<string, DiffGraphCacheEntry> = new Map();

    private constructor() {}

    /**
     * Get the singleton instance of DiffGraphCache
     */
    public static getInstance(): DiffGraphCache {
        if (!DiffGraphCache._instance) {
            DiffGraphCache._instance = new DiffGraphCache();
        }
        return DiffGraphCache._instance;
    }

    /**
     * Create a cache key from repository root and stage status
     */
    private createKey(repoRoot: string, stage: 'staged' | 'unstaged'): string {
        return `${repoRoot}:${stage}`;
    }

    /**
     * Get a cached entry for the given repository and stage
     */
    public get(repoRoot: string, stage: 'staged' | 'unstaged'): DiffGraphCacheEntry | undefined {
        const key = this.createKey(repoRoot, stage);
        return this._cache.get(key);
    }

    /**
     * Set a cache entry for the given repository and stage
     */
    public set(repoRoot: string, stage: 'staged' | 'unstaged', htmlPath: string): void {
        const key = this.createKey(repoRoot, stage);
        const entry: DiffGraphCacheEntry = {
            htmlPath,
            generatedAt: Date.now()
        };
        this._cache.set(key, entry);
    }

    /**
     * Invalidate cache entries for a specific repository and stage
     * If stage is not provided, invalidates both staged and unstaged entries for the repo
     */
    public invalidate(repoRoot: string, stage?: 'staged' | 'unstaged'): void {
        if (stage) {
            const key = this.createKey(repoRoot, stage);
            this._cache.delete(key);
        } else {
            // Invalidate both staged and unstaged for this repo
            const stagedKey = this.createKey(repoRoot, 'staged');
            const unstagedKey = this.createKey(repoRoot, 'unstaged');
            this._cache.delete(stagedKey);
            this._cache.delete(unstagedKey);
        }
    }

    /**
     * Invalidate all cache entries for a specific repository root
     * This is useful when the repository changes significantly
     */
    public invalidateRepo(repoRoot: string): void {
        this.invalidate(repoRoot);
    }

    /**
     * Clear all cache entries
     * This is useful for cleanup or testing purposes
     */
    public clear(): void {
        this._cache.clear();
    }

    /**
     * Get the number of cached entries
     */
    public size(): number {
        return this._cache.size;
    }

    /**
     * Get all cache keys (useful for debugging)
     */
    public getKeys(): string[] {
        return Array.from(this._cache.keys());
    }

    /**
     * Check if a cache entry exists and is still valid
     * This can be extended in the future to include TTL logic
     */
    public has(repoRoot: string, stage: 'staged' | 'unstaged'): boolean {
        const key = this.createKey(repoRoot, stage);
        return this._cache.has(key);
    }
}
