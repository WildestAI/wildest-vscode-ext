# Project Rules for WildestAI VSCode Extension

## Automated Version Release Process

When a pull request is merged to `main`, the GitHub Actions workflow will automatically:
1. Analyze the changes using AI to determine the appropriate version bump (patch/minor/major)
2. Update package.json and package-lock.json
3. Update CHANGELOG.md with the changes
4. Build the extension
5. Publish to VSCode Marketplace and Open VSX
6. Create and push a git tag

The automation handles releases seamlessly - you just merge your PRs and the rest happens automatically!

## Manual Release Process

If you need to manually release a version (e.g., automation fails or you need immediate control):

### 1. Determine Version Bump
Follow semantic versioning:
- **Patch** (x.x.X): Bug fixes, minor improvements, documentation updates
- **Minor** (x.X.x): New features, enhancements (backward compatible)
- **Major** (X.x.x): Breaking changes, major architectural changes

### 2. Create a Release Branch
```bash
git checkout -b release/vX.Y.Z
```

### 3. Update Version Number
- Update the `version` field in `package.json`
- **CRITICAL**: Run `npm install` after updating package.json to sync package-lock.json

### 4. Update CHANGELOG.md
- Add a new version section with current date: `## [X.Y.Z] - YYYY-MM-DD`
- Document ONLY user-facing changes that affect the published extension
- Use categories: `### Fixed`, `### Added`, `### Changed`, `### Removed`
- Be specific about what was actually fixed/added

### 5. Build and Test
```bash
npm run package
```
Ensure build completes without errors

### 6. Commit Changes
```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z"
```

### 7. Create PR and Merge
```bash
git push -u origin release/vX.Y.Z
```
Create PR to `main` and merge after approval

### 8. Publish (After Merge)
```bash
git checkout main
git pull
vsce publish
ovsx publish
git tag -a vX.Y.Z -m "Release version X.Y.Z"
git push --tags
```

## Publishing Commands Reference

- **VSCode Marketplace**: `vsce publish` (requires WILDESTAI_AZURE_PUBLISH_PAT environment variable or `-p` flag)
- **Open VSX**: `ovsx publish` (requires OPENVSX_TOKEN environment variable or `-p` flag)
- Both commands will automatically run `npm run vscode:prepublish` to build the extension

Example with tokens:
```bash
vsce publish -p $WILDESTAI_AZURE_PUBLISH_PAT
ovsx publish -p $OPENVSX_TOKEN
```

## Important Notes

- **Never push version changes directly to `main`** - always use a branch and PR
- Always run `npm install` after manually updating package.json
- The version update commit should ONLY contain: package.json, package-lock.json, CHANGELOG.md
- Verify marketplace publications succeed before creating the git tag
- Tag format must be `vX.Y.Z` (with 'v' prefix)
- Test the build before creating a release PR

## Quick Manual Release Checklist

- [ ] Create release branch: `release/vX.Y.Z`
- [ ] Update version in package.json
- [ ] Run `npm install` to sync package-lock.json
- [ ] Update CHANGELOG.md with user-facing changes
- [ ] Run `npm run package` and verify build succeeds
- [ ] Commit: `chore: bump version to X.Y.Z`
- [ ] Push and create PR to main
- [ ] After merge: `vsce publish` and `ovsx publish`
- [ ] Create and push git tag: `vX.Y.Z`
