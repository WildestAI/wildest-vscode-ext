import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Classifies the externally observable state of one extension release candidate.
 *
 * The handoff workflow never mutates an existing candidate.  Keeping this decision
 * pure makes its fail-closed behaviour testable before any GitHub write occurs.
 */
export function inspectReleaseCandidate({ branch, version, cliReleaseTag, branchExists, tagExists, pullRequests }) {
  if (!branch || !version || !cliReleaseTag) {
    throw new Error('branch, version, and cliReleaseTag are required to inspect a release candidate.');
  }

  const expectedBranch = `release/extension-v${version}`;
  if (branch !== expectedBranch) {
    return {
      state: 'mismatched-input',
      message: `Candidate branch ${branch} does not match extension version ${version}; expected ${expectedBranch}.`,
    };
  }

  const matchingPullRequests = pullRequests.filter(pullRequest => pullRequest.headRefName === branch);
  const openPullRequest = matchingPullRequests.find(pullRequest => pullRequest.state === 'OPEN');
  const mergedPullRequest = matchingPullRequests.find(pullRequest => pullRequest.state === 'MERGED' || pullRequest.mergedAt);

  if (openPullRequest && !branchExists) {
    return {
      state: 'pr-only-inconsistency',
      message: `Open candidate PR #${openPullRequest.number} exists but ${branch} is missing. Do not recreate the branch; inspect or close the PR before retrying ${cliReleaseTag}.`,
    };
  }
  if (openPullRequest) {
    return {
      state: 'open-candidate-pr',
      message: `Open candidate PR #${openPullRequest.number} already owns ${branch}; wait for review instead of preparing another ${cliReleaseTag} handoff.`,
    };
  }
  if (mergedPullRequest && tagExists) {
    return {
      state: 'merged-and-tagged',
      message: `Candidate ${branch} was merged and v${version} is already tagged. Do not recreate or republish it.`,
    };
  }
  if (mergedPullRequest) {
    return {
      state: 'merged-awaiting-tag',
      message: `Candidate PR #${mergedPullRequest.number} was merged but v${version} is not tagged. Use the normal reviewed tag/publish path; do not create another candidate.`,
    };
  }
  if (branchExists) {
    return {
      state: 'stranded-branch',
      message: `Recovery blocked: ${branch} exists without an open PR. Expected extension v${version} pinned to immutable CLI ${cliReleaseTag}. Do not overwrite it; inspect its package.json and release-inputs/diffgraph-cli.json, then open a matching review PR or delete it only through an explicit maintainer repair decision.`,
    };
  }
  if (tagExists) {
    return {
      state: 'tagged-without-candidate-pr',
      message: `v${version} is already tagged without a discoverable candidate PR. Do not prepare or publish another ${cliReleaseTag} handoff; reconcile release provenance first.`,
    };
  }
  return {
    state: 'no-candidate',
    message: `No existing candidate blocks release/extension-v${version}; a new handoff for ${cliReleaseTag} may be prepared.`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [branch, version, cliReleaseTag, branchExists, tagExists, pullRequestsPath] = process.argv.slice(2);
  if (!pullRequestsPath) {
    throw new Error('Usage: node scripts/release/release-candidate-state.mjs <branch> <version> <cli-release-tag> <branch-exists> <tag-exists> <pull-requests-json-path>');
  }
  const pullRequests = JSON.parse(await readFile(pullRequestsPath, 'utf8'));
  console.log(JSON.stringify(inspectReleaseCandidate({
    branch,
    version,
    cliReleaseTag,
    branchExists: branchExists === 'true',
    tagExists: tagExists === 'true',
    pullRequests,
  })));
}
