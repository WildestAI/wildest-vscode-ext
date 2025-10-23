# Change Log

All notable changes to the "WildestAI" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- History visualization tools are in development and will be added in future releases.

## [1.0.5] - 2025-10-22

### Fixed
- History and changes not appearing on startup without manual refresh
- Error handling and retry logic in Git repository initialization to prevent infinite loops

### Added
- Loading overlay and caching for Git history retrieval for improved performance

## [1.0.3] - 2025-08-18

### Added
- **Sidebar Explorer**: New dedicated sidebar panel with interactive tree view
- **Multi-repository Support**: Automatic detection and handling of multiple Git repositories
- **Git Integration**: Direct access to staged and unstaged changes from the sidebar with smart caching
- **Explorer Commands**: New commands for generating and displaying diff graphs
  - `wildestai.openChanges` – Generate and display unstaged changes in DiffGraph webview
  - `wildestai.openStagedChanges` – Generate and display staged changes in DiffGraph webview
  - `wildestai.refreshChanges` – Invalidate cache and regenerate unstaged changes
  - `wildestai.refreshStagedChanges` – Invalidate cache and regenerate staged changes
- **Tree Data Provider**: `DiffGraphExplorerProvider` for managing sidebar content
- **DiffGraph Webview**: Shared webview with loading states and smart caching
- **Enhanced User Experience**: Improved navigation with icon-based tree structure and instant cached access

### Changed
- Updated extension display name and descriptions
- Enhanced command palette with new explorer-specific commands
- Improved repository detection logic for better multi-repo support

## [0.1.0] - Initial Release

### Added
- Initial release of WildestAI VS Code Extension
- DiffGraph visualization generation
- Basic Git repository integration
- Cross-platform binary support (macOS, Linux, Windows)
- Progress notifications and output channel feedback
- Hello World command for testing
