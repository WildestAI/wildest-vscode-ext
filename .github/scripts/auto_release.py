#!/usr/bin/env python3
"""
Automated release script for WildestAI VSCode Extension.
Analyzes PR changes, determines version bump, updates changelog, and publishes.
"""

import os
import sys
import json
import subprocess
import re
from datetime import date
from typing import Dict, Tuple
from pydantic import BaseModel, Field
import anthropic


class VersionAnalysis(BaseModel):
    """Structured output for version analysis."""
    version_bump: str = Field(
        description="Type of version bump: 'patch', 'minor', or 'major'"
    )
    new_version: str = Field(
        description="The new version number in X.Y.Z format"
    )
    changelog_entry: str = Field(
        description="Full changelog entry in markdown format with ## [X.Y.Z] header"
    )


def run_command(cmd: str, check: bool = True) -> str:
    """Run a shell command and return output."""
    print(f"Running: {cmd}")
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, check=check
    )
    if result.returncode != 0 and check:
        print(f"Error: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()


def get_current_version() -> str:
    """Get current version from package.json."""
    with open("package.json", "r") as f:
        package = json.load(f)
    return package["version"]


def get_pr_details(base_sha: str, head_sha: str) -> Dict[str, str]:
    """Get PR title, body, and commit messages."""
    pr_title = os.getenv("PR_TITLE", "")
    pr_body = os.getenv("PR_BODY", "No description provided")

    # Get commit messages from the PR
    commits = run_command(
        f"git log --format='%s%n%b' {base_sha}..{head_sha}"
    )

    return {
        "title": pr_title,
        "body": pr_body,
        "commits": commits
    }


def analyze_version_bump(current_version: str, pr_details: Dict[str, str]) -> Tuple[str, str, str]:
    """Use Claude API to determine version bump and generate changelog."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""You are analyzing a merged pull request to determine the appropriate semantic version bump and generate a changelog entry.

Current version: {current_version}

PR Title: {pr_details['title']}

PR Description:
{pr_details['body']}

Commit messages:
{pr_details['commits']}

Based on semantic versioning rules:
- PATCH (x.x.X): Bug fixes, documentation, minor improvements that don't add features
- MINOR (x.X.x): New features, enhancements (backward compatible)
- MAJOR (X.x.x): Breaking changes

Analyze the changes and provide:
1. The type of version bump needed (patch, minor, or major)
2. The new version number calculated from the current version
3. A changelog entry in markdown format

Guidelines for changelog:
- Use today's date: {date.today().isoformat()}
- Only include user-facing changes that affect the published extension
- Be specific and accurate about what was fixed or added
- Use categories: ### Fixed, ### Added, ### Changed, ### Removed
- Focus on what users will experience, not implementation details
- Don't mention internal refactorings unless they affect user experience
- Start with ## [X.Y.Z] - YYYY-MM-DD format"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",  # Latest Sonnet 4.5
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": prompt
            }],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "version_analysis",
                    "strict": True,
                    "schema": VersionAnalysis.model_json_schema()
                }
            }
        )

        # Parse the structured output
        content = message.content[0].text
        print(f"Claude response: {content}")

        result = VersionAnalysis.model_validate_json(content)

        return (
            result.version_bump,
            result.new_version,
            result.changelog_entry
        )
    except Exception as e:
        print(f"Error calling Claude API: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def update_package_json(new_version: str):
    """Update package.json with new version."""
    print(f"Updating package.json to version {new_version}")
    run_command(f"npm version {new_version} --no-git-tag-version")


def update_changelog(changelog_entry: str):
    """Insert new changelog entry into CHANGELOG.md."""
    print("Updating CHANGELOG.md")

    with open("CHANGELOG.md", "r") as f:
        content = f.read()

    # Find the [Unreleased] section
    unreleased_match = re.search(r'## \[Unreleased\].*?\n(.*?\n)', content, re.DOTALL)
    if not unreleased_match:
        print("Error: Could not find [Unreleased] section in CHANGELOG.md")
        sys.exit(1)

    # Get the position after the unreleased section content
    insert_pos = unreleased_match.end()

    # Insert the new changelog entry
    new_content = (
        content[:insert_pos] +
        "\n" + changelog_entry + "\n\n" +
        content[insert_pos:]
    )

    with open("CHANGELOG.md", "w") as f:
        f.write(new_content)


def commit_and_push(new_version: str):
    """Commit version changes and push."""
    print("Committing version changes")
    run_command("git config user.name 'github-actions[bot]'")
    run_command("git config user.email 'github-actions[bot]@users.noreply.github.com'")
    run_command("git add package.json package-lock.json CHANGELOG.md")
    run_command(f"git commit -m 'chore: bump version to {new_version} [skip ci]'")
    run_command("git push")


def publish_extension():
    """Publish extension to VSCode Marketplace and Open VSX."""
    vsce_token = os.getenv("WILDESTAI_AZURE_PUBLISH_PAT")
    ovsx_token = os.getenv("OPENVSX_TOKEN")

    if not vsce_token or not ovsx_token:
        print("Error: WILDESTAI_AZURE_PUBLISH_PAT or OPENVSX_TOKEN not set")
        sys.exit(1)

    # Install publishing tools
    print("Installing vsce and ovsx")
    run_command("npm install -g @vscode/vsce ovsx")

    # Build extension
    print("Building extension")
    run_command("npm run package")

    # Publish to VSCode Marketplace
    print("Publishing to VSCode Marketplace")
    run_command(f"vsce publish -p {vsce_token}")

    # Publish to Open VSX
    print("Publishing to Open VSX")
    run_command(f"ovsx publish -p {ovsx_token}")


def create_git_tag(new_version: str):
    """Create and push git tag."""
    print(f"Creating git tag v{new_version}")
    run_command(f"git tag -a 'v{new_version}' -m 'Release version {new_version}'")
    run_command("git push --tags")


def main():
    """Main release automation flow."""
    print("=== Starting automated release process ===")

    # Get environment variables
    base_sha = os.getenv("BASE_SHA")
    head_sha = os.getenv("HEAD_SHA")

    if not base_sha or not head_sha:
        print("Error: BASE_SHA or HEAD_SHA not set")
        sys.exit(1)

    # Step 1: Get current version
    current_version = get_current_version()
    print(f"Current version: {current_version}")

    # Step 2: Get PR details
    pr_details = get_pr_details(base_sha, head_sha)
    print(f"PR Title: {pr_details['title']}")

    # Step 3: Analyze and determine version bump
    version_bump, new_version, changelog_entry = analyze_version_bump(
        current_version, pr_details
    )
    print(f"Version bump: {version_bump}")
    print(f"New version: {new_version}")
    print(f"Changelog:\n{changelog_entry}")

    # Step 4: Update package.json and package-lock.json
    update_package_json(new_version)

    # Step 5: Update CHANGELOG.md
    update_changelog(changelog_entry)

    # Step 6: Commit and push changes
    commit_and_push(new_version)

    # Step 7: Publish to marketplaces
    publish_extension()

    # Step 8: Create and push git tag
    create_git_tag(new_version)

    print("=== Release process completed successfully ===")
    print(f"Version {new_version} has been published!")

    # Output for GitHub Actions
    github_output = os.getenv("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"new_version={new_version}\n")
            f.write(f"changelog<<EOF\n{changelog_entry}\nEOF\n")


if __name__ == "__main__":
    main()
