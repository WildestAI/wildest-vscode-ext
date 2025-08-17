# RepoChanges Node Commands Implementation

This document describes the implementation of click commands for repoChanges nodes in the WildestAI VSCode extension.

## Overview

The extension now provides four new commands to handle diff operations for both staged and unstaged changes:

- `wildestai.openChanges` - Opens unstaged changes in a webview
- `wildestai.openStagedChanges` - Opens staged changes in a webview  
- `wildestai.refreshChanges` - Refreshes unstaged changes (invalidates cache and regenerates)
- `wildestai.refreshStagedChanges` - Refreshes staged changes (invalidates cache and regenerates)

## Key Features

### 1. Smart Caching
- **First open or after refresh**: Builds temp file path, calls CLI via `CliService`, caches result
- **Subsequent opens**: Bypasses CLI and loads cached HTML directly
- Cache keys use format: `{repoRoot}:{staged|unstaged}`
- Cache entries include HTML file path and timestamp

### 2. CLI Integration
Commands are executed via the existing `CliService` with appropriate arguments:
- Unstaged changes: `wild diff --output <temp-file> --no-open`
- Staged changes: `wild diff --staged --output <temp-file> --no-open`

### 3. Webview Display
Generated HTML content is displayed in the main DiffGraph webview using `DiffGraphViewProvider`:
- Single shared webview for all diff content
- Script execution enabled
- Local resource roots configured for assets
- Loading screen shown during generation

## Architecture

### DiffService Class
Main service class that coordinates diff operations:

```typescript
export class DiffService {
  // Core methods
  async openChanges(context: vscode.ExtensionContext): Promise<void>
  async openStagedChanges(context: vscode.ExtensionContext): Promise<void>
  async refreshChanges(context: vscode.ExtensionContext): Promise<void>
  async refreshStagedChanges(context: vscode.ExtensionContext): Promise<void>
}
```

### Cache Integration
Uses the existing `DiffGraphCache` singleton:
- Automatic cache validation (checks if HTML file exists)
- Cache invalidation on refresh operations
- Temporary file management in OS temp directory

### DiffGraphViewProvider Integration
Uses the shared `DiffGraphViewProvider` for display:
- `showLoadingScreen()` - Shows loading state during generation
- `showDiffGraph(htmlPath)` - Displays generated HTML content
- Single webview instance shared across all diff operations

### Command Registration
Commands are registered in `extension.ts` and declared in `package.json`:

```json
{
  "command": "wildestai.openChanges",
  "title": "Open Changes",
  "icon": "$(diff)"
}
```

## Implementation Details

### Temporary File Management
- Files are created in OS temp directory
- Naming pattern: `wildest-{repoName}-{stage}-{timestamp}.html`
- Files persist until manually cleaned up (handled by OS temp cleanup)

### Error Handling
- Git repository detection via `GitService`
- CLI execution errors are properly caught and displayed
- Cache miss handling (regenerates when cached file doesn't exist)

### Progress Indicators
- Shows progress notification during CLI execution
- Elapsed time tracking and completion notifications
- Proper logging to output channel

## Usage Flow

1. **User clicks repoChanges node command**
2. **Cache check**: Look for existing cached entry
3. **Cache hit**: Load HTML directly from cached file via DiffGraphViewProvider
4. **Cache miss**: 
   - Show loading screen in webview
   - Generate temp file path
   - Execute CLI command with appropriate arguments
   - Cache the result
   - Display HTML in shared webview via DiffGraphViewProvider
5. **Refresh**: Invalidate cache and force regeneration

## Testing

The implementation includes comprehensive tests covering:
- Service instantiation
- Cache integration
- Cache invalidation scenarios
- Mock context handling

Run tests with: `npm test`

## Files Modified/Created

### New Files
- `src/services/DiffService.ts` - Main service for diff operations
- `src/test/DiffService.test.ts` - Test suite
- `docs/Leaf-Node-Commands.md` - This documentation

### Modified Files
- `src/extension.ts` - Command registration and wiring
- `package.json` - Command declarations with icons

## Future Enhancements

1. **TTL Cache**: Add time-based cache expiration
2. **File Cleanup**: Automatic cleanup of old temp files  
3. **Context Menus**: Add commands to tree view context menus
4. **Keyboard Shortcuts**: Define default key bindings
5. **Status Bar**: Show cache status and operation progress
