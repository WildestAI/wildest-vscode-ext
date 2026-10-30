import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Decides whether a just-pushed release-candidate branch may open a PR, or
 * whether a concurrent handoff already owns the review. This is deliberately
 * pure so the workflow can re-read GitHub after a create race without ever
 * overwriting the branch.
 */
export function recoverReleaseCandidatePullRequest({ branch, pullRequests }) {
  if (!branch) throw new Error('branch is required to recover a release candidate pull request.');

  const matchingPullRequests = pullRequests.filter(pullRequest => pullRequest.headRefName === branch);
  const openPullRequests = matchingPullRequests.filter(pullRequest => pullRequest.state?.toUpperCase() === 'OPEN');

  if (matchingPullRequests.length > openPullRequests.length) {
    const priorPullRequest = matchingPullRequests.find(pullRequest => pullRequest.state?.toUpperCase() !== 'OPEN');
    return {
      action: 'blocked-closed-pr',
      message: `Recovery blocked: ${branch} has prior non-open candidate PR #${priorPullRequest.number}. Do not reopen or replace it automatically; inspect its release inputs before a maintainer repair decision.`,
    };
  }
  if (openPullRequests.length === 1) {
    return {
      action: 'use-existing-pr',
      pullRequestNumber: openPullRequests[0].number,
      message: `Release candidate ${branch} already has open PR #${openPullRequests[0].number}; preserving the concurrent review instead of creating a duplicate.`,
    };
  }
  if (openPullRequests.length > 1) {
    return {
      action: 'blocked-duplicate-prs',
      message: `Recovery blocked: ${branch} has ${openPullRequests.length} open candidate PRs. Do not select or close either automatically; reconcile the duplicate reviews before retrying.`,
    };
  }
  return {
    action: 'create-pr',
    message: `No candidate PR exists for ${branch}; creating its reviewable release handoff PR is safe.`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [branch, pullRequestsPath] = process.argv.slice(2);
  if (!pullRequestsPath) {
    throw new Error('Usage: node scripts/release/recover-release-candidate-pr.mjs <branch> <pull-requests-json-path>');
  }
  const pullRequests = JSON.parse(await readFile(pullRequestsPath, 'utf8'));
  console.log(JSON.stringify(recoverReleaseCandidatePullRequest({ branch, pullRequests })));
}
