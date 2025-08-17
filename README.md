
# WildestAI VS Code Extension

WildestAI is a Visual Studio Code extension that enhances your development workflow with advanced features and seamless integration. This extension is designed to help you be more productive and efficient in your coding tasks.


## Features

- **Sidebar Explorer**: Interactive tree view for navigating Git repositories and changes
- **DiffGraph Visualization**: Generate interactive DiffGraph visualizations displayed in a shared webview
- **Git Integration**: View and refresh both staged and unstaged changes directly from the sidebar
- **Multi-repository Support**: Automatic detection and handling of multiple Git repositories in your workspace
- **Progress Notifications**: Real-time feedback with output channel for CLI operations
- **Cross-platform Support**: Automatic detection of development or production mode
- **Native Notifications**: macOS native notifications when generation completes

<!-- Add screenshots or GIFs in the images/ folder if available -->


## Requirements

- Visual Studio Code 1.70.0 or later
- A Git repository must be open in your workspace
- For development mode: Python virtual environment with the `wild` CLI installed (see extension source for venv path)
- For production: The packaged `wild` binary must be present in the `bin/` directory


## Sidebar Explorer

The WildestAI extension adds a dedicated sidebar panel to VS Code with two main sections:

### Explorer View
- **Changes**: Navigate through unstaged changes in your Git repositories
- **Staged Changes**: View and manage staged changes ready for commit
- **Graph**: Access to DiffGraph visualization tools
- **Multi-repository Support**: Automatically detects and displays all Git repositories in your workspace

### Usage
1. Open the WildestAI sidebar by clicking the WildestAI icon in the Activity Bar
2. Expand the "Explorer" section to see your repository structure
3. Click on "Changes" or "Staged Changes" nodes to generate and view diff graphs in the shared webview
4. Use the refresh commands (right-click context menu) to update and regenerate cached content
5. View generated graphs in the DiffGraph webview panel

## Commands

This extension contributes the following commands:

### Core Commands
- `WildestAI: Hello World` (`wildestai.helloWorld`): Shows a Hello World message
- `WildestAI: Generate DiffGraph` (`wildestai.generate`): Generates a DiffGraph HTML visualization for your current Git repository

### Explorer Commands
- `WildestAI: Open Changes` (`wildestai.openChanges`): Generate and display unstaged changes in the DiffGraph webview
- `WildestAI: Open Staged Changes` (`wildestai.openStagedChanges`): Generate and display staged changes in the DiffGraph webview
- `WildestAI: Refresh Changes` (`wildestai.refreshChanges`): Invalidate cache and regenerate unstaged changes
- `WildestAI: Refresh Staged Changes` (`wildestai.refreshStagedChanges`): Invalidate cache and regenerate staged changes

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

- `wildestai.enable`: Enable/disable the WildestAI extension.
- `wildestai.featureX`: Enable feature X (default: true).


## Known Issues

- No known issues at this time. Please report any bugs or feature requests via the issue tracker.
- The extension currently supports macOS, Linux, and Windows (see source for supported binaries)


## Release Notes

### 1.0.0
- Initial release of WildestAI.

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

## License

This project is licensed under the GNU General Public License v3.0 or later (GPLv3). See the [LICENSE](./LICENSE) file for details.

**Enjoy!**
