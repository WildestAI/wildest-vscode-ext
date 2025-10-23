# Automated Release System

This directory contains scripts and workflows for automatically releasing new versions of the WildestAI VSCode extension when pull requests are merged to `main`.

## How It Works

1. When a PR is merged to `main`, the GitHub Actions workflow ([../.github/workflows/auto-release.yml](../workflows/auto-release.yml)) is triggered
2. The Python script ([auto_release.py](./auto_release.py)) uses Claude AI to:
   - Analyze the PR changes (title, description, commits)
   - Determine the appropriate semantic version bump (patch/minor/major)
   - Generate a changelog entry
3. The script then automatically:
   - Updates `package.json` and `package-lock.json`
   - Updates `CHANGELOG.md`
   - Commits and pushes the changes
   - Builds the extension
   - Publishes to VSCode Marketplace and Open VSX
   - Creates a git tag
   - Creates a GitHub Release

## Required GitHub Secrets

The following secrets must be configured in the repository settings (Settings → Secrets and variables → Actions):

### `ANTHROPIC_API_KEY`
Your Anthropic API key for Claude AI
- Get it from: https://console.anthropic.com/
- Used for: Analyzing changes and determining version bumps

### `WILDESTAI_AZURE_PUBLISH_PAT`
Visual Studio Code Marketplace Personal Access Token (Azure DevOps PAT)
- Get it from: https://marketplace.visualstudio.com/manage
- Requires: Publisher access for WildestAI
- Used for: Publishing to VSCode Marketplace

### `OPENVSX_TOKEN`
Open VSX Registry Access Token
- Get it from: https://open-vsx.org/user-settings/tokens
- Requires: Publisher access for WildestAI
- Used for: Publishing to Open VSX Registry

## Manual Testing

To test the release script locally:

```bash
# Set environment variables
export ANTHROPIC_API_KEY="your-key"
export WILDESTAI_AZURE_PUBLISH_PAT="your-vsce-token"
export OPENVSX_TOKEN="your-ovsx-token"
export PR_TITLE="Fix: some bug"
export PR_BODY="This fixes the bug"
export BASE_SHA="abc123"  # Previous commit SHA
export HEAD_SHA="def456"  # Current commit SHA

# Run the script
python .github/scripts/auto_release.py
```

**Warning:** This will actually publish a release! Only test in a forked repository or with dry-run modifications.

## Files

- **auto_release.py**: Main Python script that handles the entire release process
- **requirements.txt**: Python dependencies (anthropic, pydantic)
- **README.md**: This file

## Dependencies

- Python 3.13.5+
- Node.js 22.15.1+
- Python packages: anthropic, pydantic
- Node packages: @vscode/vsce, ovsx

## Troubleshooting

### Workflow doesn't trigger
- Ensure the PR was actually **merged** (not just closed)
- Check that the target branch is `main`
- Verify workflow file syntax with GitHub Actions validator

### Authentication errors
- Verify all three secrets are configured correctly
- Check that tokens haven't expired
- Ensure publisher access for both marketplaces

### Version calculation errors
- Check ANTHROPIC_API_KEY is valid and has quota
- Review Claude API logs in workflow output
- Verify commits follow conventional format

### Publishing fails
- Check that `npm run package` succeeds locally
- Verify extension builds without errors
- Ensure all required files are included in package

## Disabling Automation

To disable automatic releases while keeping the infrastructure:
1. Comment out or remove the workflow file: `.github/workflows/auto-release.yml`
2. Or add `if: false` to the job in the workflow

Manual releases can still be performed following the guide in [/.claude/rules.md](../../.claude/rules.md).
