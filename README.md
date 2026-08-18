
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

- Visual Studio Code 1.99.0 or later
- A Git repository must be open in your workspace
- Production runtime selection uses only a CLI artifact bundled with the extension. It recognizes package targets for macOS x64/ARM64, Linux x64/ARM64, and Windows x64; other targets are rejected rather than running an incompatible binary. Diagnostics report a missing runtime when the selected release does not contain that artifact. Clean-install packaging and smoke-test coverage remain tracked in [issue #19](https://github.com/WildestAI/wildest-vscode-ext/issues/19).
- Development mode uses a Python virtual environment only when `WILDEST_DEV_MODE=1` or `NODE_ENV=development`. Set `WILDEST_VENV_PATH` when the environment is not at the default development path.

Run **Wildest AI: Show Runtime Diagnostics** from the Command Palette to see the extension version, selected CLI source and path, platform, CLI version, and actionable readiness status. A missing artifact, an unsupported platform/architecture, and a present artifact without execute permission are reported separately. The command uses bounded `wild --version` and `wild diff --format json` probes against an isolated synthetic Git fixture to validate deterministic DiffGraph JSON output and its schema major; it does not analyze your repository or contact an AI provider. Probe errors are redacted, the temporary fixture is removed after the check, and the report contains no API keys or provider credentials.

### DiffGraph artifact compatibility

The extension contract tests vendor the CLI's complete local-only DiffGraph v2 example at
`src/test/fixtures/diffgraph-v2.structural.example.json`. Its canonical source is
`DiffGraph-CLI/diffgraph/schema/diffgraph-v2.structural.example.json` (SHA-256
`580a35c321ed7ae7be8ce6605f6aafb21f00a512b028d1f91495e83f566f35fd`). Re-copy the
fixture byte-for-byte when the CLI contract changes and update the hash only after reviewing that
upstream change.

Consumers require `schema_version` in `MAJOR.MINOR` form, reject unknown majors, and accept
additive major-2 minor versions only when the complete artifact still satisfies the extension's
v2 contract. This compatibility parser does not replace or migrate the current HTML webview
renderer.


## Sidebar Explorer

The WildestAI extension adds a dedicated sidebar panel to VS Code with two main sections:

### Explorer View
- **Changes**: Navigate through unstaged changes in your Git repositories
- **Staged Changes**: View and manage staged changes ready for commit
- **History (experimental)**: Placeholder for upcoming history visualization tools (not yet implemented)
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
