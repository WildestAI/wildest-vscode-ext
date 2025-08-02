# Product Status: LLM-Powered DiffGraph VSCode Extension

## Phase 1: Foundation & CLI Integration

1. **Project Setup & Basic Extension**
   - ✅ Completed: VSCode extension project initialized with TypeScript and esbuild. Basic scripts set up. Extension compiles and activates.

2. **Command Registration**
   - ✅ Completed: `diffGraph.generate` command registered in `extension.ts` and added to `package.json`. Command appears in the Command Palette and shows an information message when executed.

3. **Basic Webview Panel Creation**
   - ✅ Completed: The command handler now creates and shows a `vscode.WebviewPanel` with a placeholder HTML content ("<h1>Generating DiffGraph...</h1>").

4. **Obtain Raw Git Diff Content (for a Changeset)**
   - ✅ Completed: The extension now accesses the Git extension to get the repository path, but does not calculate the diff itself. The Rust CLI tool is responsible for all git operations and diff calculation.

5. **Execute External DiffGraph CLI Tool**
   - ✅ Completed: The extension now executes the external `diffgraph-cli` tool, passing only the repository path and output directory via environment variables (GIT_DIR, OUTPUT_PATH, LINK_URL). The CLI command, stdout, and stderr are logged to the output channel. No diff is calculated in the extension.

6. **Load Generated HTML into Webview**
   - ⬜ Not Started: No logic to load HTML output from CLI into a Webview.

---

## Summary
- **Current Progress:** Steps 1–5 of Phase 1 are complete (project setup, scripts, build system, command registration, WebviewPanel creation, and CLI integration with correct environment setup). The extension no longer calculates the diff itself; all git/diff logic is handled by the Rust CLI.
- **Next Step:** Load the generated HTML from the CLI into the webview panel.

_This status is based on the Product Roadmap as of 1 June 2025._
