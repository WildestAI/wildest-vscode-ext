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
import { DiffGraphCache } from '../services/DiffGraphCache';

suite('DiffGraphCache Test Suite', () => {
    let cache: DiffGraphCache;

    setup(() => {
        cache = DiffGraphCache.getInstance();
        cache.clear(); // Start with a clean cache for each test
    });

    test('getInstance returns singleton', () => {
        const cache1 = DiffGraphCache.getInstance();
        const cache2 = DiffGraphCache.getInstance();
        assert.strictEqual(cache1, cache2, 'getInstance should return the same instance');
    });

    test('set and get basic functionality', () => {
        const repoRoot = '/path/to/repo';
        const htmlPath = '/tmp/diffgraph-123.html';
        
        cache.set(repoRoot, 'staged', htmlPath);
        
        const entry = cache.get(repoRoot, 'staged');
        assert.ok(entry, 'Entry should exist');
        assert.strictEqual(entry.htmlPath, htmlPath, 'HTML path should match');
        assert.ok(entry.generatedAt > 0, 'Generated timestamp should be set');
    });

    test('get returns undefined for non-existent entries', () => {
        const entry = cache.get('/non/existent/repo', 'staged');
        assert.strictEqual(entry, undefined, 'Non-existent entry should return undefined');
    });

    test('different stages have separate cache entries', () => {
        const repoRoot = '/path/to/repo';
        const stagedHtml = '/tmp/staged.html';
        const unstagedHtml = '/tmp/unstaged.html';

        cache.set(repoRoot, 'staged', stagedHtml);
        cache.set(repoRoot, 'unstaged', unstagedHtml);

        const stagedEntry = cache.get(repoRoot, 'staged');
        const unstagedEntry = cache.get(repoRoot, 'unstaged');

        assert.ok(stagedEntry, 'Staged entry should exist');
        assert.ok(unstagedEntry, 'Unstaged entry should exist');
        assert.strictEqual(stagedEntry.htmlPath, stagedHtml, 'Staged HTML path should match');
        assert.strictEqual(unstagedEntry.htmlPath, unstagedHtml, 'Unstaged HTML path should match');
    });

    test('has method works correctly', () => {
        const repoRoot = '/path/to/repo';
        const htmlPath = '/tmp/test.html';

        assert.strictEqual(cache.has(repoRoot, 'staged'), false, 'Should not have entry initially');
        
        cache.set(repoRoot, 'staged', htmlPath);
        assert.strictEqual(cache.has(repoRoot, 'staged'), true, 'Should have entry after setting');
        assert.strictEqual(cache.has(repoRoot, 'unstaged'), false, 'Should not have unstaged entry');
    });

    test('invalidate specific stage', () => {
        const repoRoot = '/path/to/repo';
        
        cache.set(repoRoot, 'staged', '/tmp/staged.html');
        cache.set(repoRoot, 'unstaged', '/tmp/unstaged.html');
        
        cache.invalidate(repoRoot, 'staged');
        
        assert.strictEqual(cache.has(repoRoot, 'staged'), false, 'Staged entry should be invalidated');
        assert.strictEqual(cache.has(repoRoot, 'unstaged'), true, 'Unstaged entry should remain');
    });

    test('invalidate all stages for repo', () => {
        const repoRoot = '/path/to/repo';
        
        cache.set(repoRoot, 'staged', '/tmp/staged.html');
        cache.set(repoRoot, 'unstaged', '/tmp/unstaged.html');
        
        cache.invalidate(repoRoot);
        
        assert.strictEqual(cache.has(repoRoot, 'staged'), false, 'Staged entry should be invalidated');
        assert.strictEqual(cache.has(repoRoot, 'unstaged'), false, 'Unstaged entry should be invalidated');
    });

    test('invalidateRepo works same as invalidate without stage', () => {
        const repoRoot = '/path/to/repo';
        
        cache.set(repoRoot, 'staged', '/tmp/staged.html');
        cache.set(repoRoot, 'unstaged', '/tmp/unstaged.html');
        
        cache.invalidateRepo(repoRoot);
        
        assert.strictEqual(cache.has(repoRoot, 'staged'), false, 'Staged entry should be invalidated');
        assert.strictEqual(cache.has(repoRoot, 'unstaged'), false, 'Unstaged entry should be invalidated');
    });

    test('size and clear methods', () => {
        assert.strictEqual(cache.size(), 0, 'Cache should start empty');
        
        cache.set('/repo1', 'staged', '/tmp/1.html');
        cache.set('/repo2', 'unstaged', '/tmp/2.html');
        
        assert.strictEqual(cache.size(), 2, 'Cache should have 2 entries');
        
        cache.clear();
        assert.strictEqual(cache.size(), 0, 'Cache should be empty after clear');
    });

    test('getKeys returns correct keys', () => {
        const repo1 = '/path/to/repo1';
        const repo2 = '/path/to/repo2';
        
        cache.set(repo1, 'staged', '/tmp/1.html');
        cache.set(repo2, 'unstaged', '/tmp/2.html');
        
        const keys = cache.getKeys();
        assert.strictEqual(keys.length, 2, 'Should have 2 keys');
        assert.ok(keys.includes(`${repo1}:staged`), 'Should include repo1:staged key');
        assert.ok(keys.includes(`${repo2}:unstaged`), 'Should include repo2:unstaged key');
    });

    test('different repos have separate cache entries', () => {
        const repo1 = '/path/to/repo1';
        const repo2 = '/path/to/repo2';
        const htmlPath = '/tmp/test.html';
        
        cache.set(repo1, 'staged', htmlPath);
        cache.set(repo2, 'staged', htmlPath);
        
        assert.strictEqual(cache.has(repo1, 'staged'), true, 'Repo1 should have entry');
        assert.strictEqual(cache.has(repo2, 'staged'), true, 'Repo2 should have entry');
        
        cache.invalidate(repo1, 'staged');
        
        assert.strictEqual(cache.has(repo1, 'staged'), false, 'Repo1 entry should be invalidated');
        assert.strictEqual(cache.has(repo2, 'staged'), true, 'Repo2 entry should remain');
    });
});
