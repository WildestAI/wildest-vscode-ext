# DiffGraphCache

An in-memory cache implementation for storing DiffGraph HTML content to optimize performance by avoiding repeated generation of identical content.

## Overview

The `DiffGraphCache` is a singleton service that provides caching functionality for generated DiffGraph HTML files. It uses a simple Map-based approach with keys in the format `{repoRoot}:{staged|unstaged}`.

## Features

- **In-memory storage**: No disk persistence, fast access
- **Repository-aware**: Separate cache entries for different repositories
- **Stage-aware**: Separate cache for staged vs unstaged changes  
- **Singleton pattern**: Single instance across the extension
- **Helper methods**: Easy-to-use `get`, `set`, and `invalidate` operations
- **Cache management**: Size tracking, key listing, and cleanup utilities

## Key Format

Cache keys follow the pattern: `{repoRoot}:{staged|unstaged}`

Examples:
- `/Users/username/my-project:staged`
- `/home/user/another-repo:unstaged`

## API Reference

### Core Methods

#### `get(repoRoot: string, stage: 'staged' | 'unstaged'): DiffGraphCacheEntry | undefined`
Retrieve a cached entry for the given repository and stage.

#### `set(repoRoot: string, stage: 'staged' | 'unstaged', htmlPath: string): void`
Store a cache entry with the HTML file path and current timestamp.

#### `invalidate(repoRoot: string, stage?: 'staged' | 'unstaged'): void`
Remove cache entries. If stage is omitted, removes both staged and unstaged entries for the repository.

### Utility Methods

#### `has(repoRoot: string, stage: 'staged' | 'unstaged'): boolean`
Check if a cache entry exists without retrieving it.

#### `size(): number`
Get the total number of cached entries.

#### `getKeys(): string[]`
Get all cache keys (useful for debugging).

#### `clear(): void`
Remove all cache entries.

#### `invalidateRepo(repoRoot: string): void`
Alias for `invalidate(repoRoot)` - removes all entries for a repository.

## Data Structure

```typescript
interface DiffGraphCacheEntry {
    htmlPath: string;       // Path to the generated HTML file
    generatedAt: number;    // Timestamp when cached (Date.now())
}
```

## Usage Examples

### Basic Usage

```typescript
import { DiffGraphCache } from '../services/DiffGraphCache';

const cache = DiffGraphCache.getInstance();

// Check for cached content
const cached = cache.get('/path/to/repo', 'staged');
if (cached) {
    // Use cached HTML file
    const htmlContent = fs.readFileSync(cached.htmlPath, 'utf8');
} else {
    // Generate new DiffGraph and cache it
    const htmlPath = await generateDiffGraph();
    cache.set('/path/to/repo', 'staged', htmlPath);
}
```

### Invalidation on Repository Changes

```typescript
// When repository state changes, invalidate relevant cache
cache.invalidateRepo('/path/to/repo');

// Or invalidate specific stage only
cache.invalidate('/path/to/repo', 'staged');
```

### Cache Management

```typescript
// Check cache statistics
console.log(`Cache size: ${cache.size()}`);
console.log(`Cache keys: ${cache.getKeys().join(', ')}`);

// Clean up all entries
cache.clear();
```

## Integration with DiffGraphViewProvider

See `src/examples/DiffGraphCacheIntegration.ts` for a comprehensive example of how to integrate this cache with the existing DiffGraphViewProvider.

## Testing

The cache includes comprehensive unit tests in `src/test/DiffGraphCache.test.ts` covering:
- Basic get/set operations
- Singleton behavior
- Stage separation
- Repository separation
- Invalidation logic
- Utility methods

Run tests with: `npm test`

## Design Decisions

1. **Singleton Pattern**: Ensures single cache instance across the extension
2. **In-Memory Only**: Fast access, no disk I/O overhead
3. **Simple Key Format**: Easy to construct and parse
4. **No TTL**: Explicit invalidation only - extensions should manage cache lifecycle
5. **File Path Storage**: Stores path rather than content to minimize memory usage
6. **TypeScript**: Full type safety and IntelliSense support

## Future Enhancements

Potential improvements that could be added:
- TTL (time-to-live) support for automatic expiration
- LRU (Least Recently Used) eviction policy
- Cache size limits
- Disk persistence option
- Cache hit/miss statistics
- Async file existence validation
