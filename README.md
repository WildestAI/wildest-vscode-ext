
# WildestAI VS Code Extension

WildestAI is a Visual Studio Code extension that enhances your development workflow with advanced features and seamless integration. This extension is designed to help you be more productive and efficient in your coding tasks.


## Features

- Generate interactive DiffGraph visualizations for your Git repository
- Run the `WildestAI: Generate DiffGraph` command to analyze code changes
- Progress notifications and output channel for CLI feedback
- Automatic detection of development or production mode
- macOS native notifications when generation completes

<!-- Add screenshots or GIFs in the images/ folder if available -->


## Requirements

- Visual Studio Code 1.70.0 or later
- A Git repository must be open in your workspace
- For development mode: Python virtual environment with the `wild` CLI installed (see extension source for venv path)
- For production: The packaged `wild` binary must be present in the `bin/` directory


## Commands

This extension contributes the following commands:

- `WildestAI: Hello World` (`wildestai.helloWorld`): Shows a Hello World message
- `WildestAI: Generate DiffGraph` (`wildestai.generate`): Generates a DiffGraph HTML visualization for your current Git repository

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

- `wildestai.enable`: Enable/disable the WildestAI extension.
- `wildestai.featureX`: Enable feature X (default: true).


## Known Issues

- No known issues at this time. Please report any bugs or feature requests via the issue tracker.
- Only the first Git repository in the workspace is used
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

**Enjoy!**
