# Extension release contract

The extension never builds its native DiffGraph CLI itself. Before creating an extension tag, maintainers must update `release-inputs/diffgraph-cli.json` with the exact immutable GitHub release tag produced by the DiffGraph CLI release workflow. That release must contain **only** these release files:

- `wild-macos-arm64`
- `wild-macos-x64`
- `wild-linux-arm64`
- `wild-linux-x64`
- `wild-win.exe`
- `SHA256SUMS`, with one SHA-256 entry for each binary above
- `cli-manifest.json`

`PENDING_IMMUTABLE_CLI_RELEASE` is deliberately allowed in pull-request preflight so the extension release pipeline can be reviewed before the native CLI release exists. It is rejected by the tag workflow. This makes the dependency explicit: merge and publish the matching DiffGraph CLI release first, update the release input to its immutable `cli-v<version>-<12-char-sha>` tag, merge that change, then create the matching extension tag (`v<package.json version>`).

The tag workflow downloads the locked release, rejects draft/prerelease or unexpected assets, verifies every checksum, packages the VSIX, and only then publishes it. Pull requests and pushes to `main` never publish to either marketplace.

## Eligible CLI release handoff

`Prepare verified extension release handoff` polls the public DiffGraph CLI releases hourly and selects the highest final immutable `cli-v<semver>-<commit>` release that is newer than the extension. The matching extension version is the CLI release semver. It validates that the CLI GitHub release is published and final, downloads and checksum-verifies its locked assets, then creates a **release pull request only**. The PR changes `package.json`, `package-lock.json`, and the CLI release input together. An explicit workflow dispatch may provide both version and tag instead; providing just one is rejected.

After normal review and merge, `Tag merged verified extension release candidate` runs only for a `github-actions[bot]` PR whose branch is exactly `release/extension-v<package.json version>`. It repeats the CLI contract, published/final-release, checksum, and clean VSIX checks, then creates only the exact matching absent `v<package.json version>` tag. It refuses to overwrite a tag. The existing tagged workflow remains the sole publisher and repeats its immutable CLI, checksum, extension-test, and VSIX gates before either marketplace is contacted.

The CLI workflow's built-in `GITHUB_TOKEN` is scoped to its own repository and cannot securely dispatch an event that writes to this repository. This extension-side polling path therefore requires no cross-repository PAT, GitHub App installation, or new credential. A future repository-dispatch integration needs a separately approved cross-repository credential and must not replace the polling safeguards.
