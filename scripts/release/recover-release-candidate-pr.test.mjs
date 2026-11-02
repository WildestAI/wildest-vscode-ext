import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverReleaseCandidatePullRequest } from './recover-release-candidate-pr.mjs';

const branch = 'release/extension-v1.2.0';

test('allows creating a PR only when no candidate PR exists', () => {
  assert.equal(recoverReleaseCandidatePullRequest({ branch, pullRequests: [] }).action, 'create-pr');
});

test('uses a concurrent matching candidate PR rather than creating a duplicate', () => {
  const result = recoverReleaseCandidatePullRequest({
    branch,
    pullRequests: [{ number: 42, state: 'OPEN', headRefName: branch }],
  });
  assert.equal(result.action, 'use-existing-pr');
  assert.equal(result.pullRequestNumber, 42);
});

test('fails closed when duplicate concurrent candidate PRs exist', () => {
  const result = recoverReleaseCandidatePullRequest({
    branch,
    pullRequests: [
      { number: 42, state: 'OPEN', headRefName: branch },
      { number: 43, state: 'open', headRefName: branch },
    ],
  });
  assert.equal(result.action, 'blocked-duplicate-prs');
  assert.match(result.message, /2 open candidate PRs/);
});

test('fails closed for a previous closed candidate PR', () => {
  const result = recoverReleaseCandidatePullRequest({
    branch,
    pullRequests: [{ number: 42, state: 'CLOSED', headRefName: branch }],
  });
  assert.equal(result.action, 'blocked-closed-pr');
  assert.match(result.message, /#42/);
});

test('fails closed when an open candidate also has a prior closed PR', () => {
  const result = recoverReleaseCandidatePullRequest({
    branch,
    pullRequests: [
      { number: 42, state: 'OPEN', headRefName: branch },
      { number: 41, state: 'CLOSED', headRefName: branch },
    ],
  });
  assert.equal(result.action, 'blocked-closed-pr');
  assert.match(result.message, /#41/);
});

test('ignores pull requests for another candidate branch', () => {
  const result = recoverReleaseCandidatePullRequest({
    branch,
    pullRequests: [{ number: 42, state: 'OPEN', headRefName: 'release/extension-v1.1.0' }],
  });
  assert.equal(result.action, 'create-pr');
});
