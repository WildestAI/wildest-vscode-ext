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
