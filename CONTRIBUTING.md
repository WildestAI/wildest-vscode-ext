# Contributing to WildestAI VSCode Extension

Thank you for your interest in contributing to the WildestAI VSCode Extension! This document provides guidelines and instructions for setting up your development environment and contributing to the project.

## Development Setup

### Prerequisites

- Node.js (v16 or later)
- npm
- Git
- Python 3.8+ (for CLI development)
- Visual Studio Code

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/WildestAI/wildest-vscode-ext.git
   cd wildest-vscode-ext
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the wild CLI for development**

   The extension can run in two modes:
   - **Production mode**: Uses pre-built binaries from the `bin/` directory
   - **Development mode**: Uses the `wild` CLI from a Python virtual environment

   For development, you'll want to use development mode to test the latest CLI features:

   **Option 1: Clone DiffGraph-CLI in the workspace root (default)**
   ```bash
   # From the wildest-vscode-ext directory
   cd ..
   git clone https://github.com/WildestAI/DiffGraph-CLI.git
   cd DiffGraph-CLI
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -e .
   cd ../wildest-vscode-ext
   ```

   **Option 2: Use an existing DiffGraph-CLI installation**

   Set the `WILDEST_VENV_PATH` environment variable to point to your venv:
   ```bash
   # In your shell profile (.bashrc, .zshrc, etc.)
   export WILDEST_VENV_PATH=/path/to/your/DiffGraph-CLI/.venv
   ```

   Or add it to your VSCode user settings (settings.json):
   ```json
   "terminal.integrated.env.osx": {
       "WILDEST_VENV_PATH": "/path/to/your/DiffGraph-CLI/.venv"
   }
   ```

### Running the Extension

1. Open the project in VSCode
2. Press `F5` to launch the Extension Development Host
   - The `.vscode/launch.json` automatically sets `WILDEST_DEV_MODE=1`
   - This enables development mode, which uses the CLI from your venv
3. Test your changes in the Extension Development Host window

### Development Workflow

1. **Make your changes** in the source code
2. **Compile** the extension:
   ```bash
   npm run compile
   ```
3. **Run tests**:
   ```bash
   npm test
   ```
4. **Check types**:
   ```bash
   npm run check-types
   ```
5. **Lint your code**:
   ```bash
   npm run lint
   ```

### Project Structure

```
wildest-vscode-ext/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── providers/             # Tree and webview providers
│   ├── services/              # Business logic (Git, CLI, Diff)
│   └── utils/                 # Utility functions and types
├── dist/                      # Compiled output
├── bin/                       # Pre-built wild binaries
├── .vscode/
│   └── launch.json           # Debug configuration
└── package.json
```

### Building for Production

To create a production build:
```bash
npm run package
```

This will:
1. Run type checking
2. Run linting
3. Build with production optimizations
4. Output to `dist/` directory

### Environment Variables

- `WILDEST_DEV_MODE`: Set to `1` to enable development mode (uses venv instead of binary)
- `WILDEST_VENV_PATH`: Path to the Python virtual environment containing the `wild` CLI
- `NODE_ENV`: Set to `development` to enable development mode (alternative to WILDEST_DEV_MODE)

### Git Workflow

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes and commit with clear, descriptive messages
3. Push your branch and create a pull request

### Commit Message Guidelines

We follow conventional commit format:
- `feat:` for new features
- `fix:` for bug fixes
- `chore:` for maintenance tasks
- `docs:` for documentation changes
- `refactor:` for code refactoring
- `test:` for adding tests

Example:
```
feat: add JSON graph visualization support

- Update CLI commands to use -f graph flag
- Add vis-network based graph rendering
- Support for component and file node visualization
```

### Testing

- Manual testing: Use F5 to launch the extension and test in a real VSCode window
- Automated tests: `npm test`
- Always test with both staged and unstaged changes

### Getting Help

- Open an issue on GitHub for bugs or feature requests
- Check existing issues before opening a new one
- Join our community discussions

## License

By contributing to WildestAI VSCode Extension, you agree that your contributions will be licensed under the GNU General Public License v3.0 or later (GPLv3).
