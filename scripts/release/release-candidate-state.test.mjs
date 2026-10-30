import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectReleaseCandidate } from './release-candidate-state.mjs';

const inputs = {
  branch: 'release/extension-v1.2.0',
  version: '1.2.0',
  cliReleaseTag: 'cli-v1.2.0-a1b2c3d4e5f6',
  branchExists: false,
  tagExists: false,
  pullRequests: [],
};

function state(overrides) {
  return inspectReleaseCandidate({ ...inputs, ...overrides });
}

test('allows a handoff only when no candidate state exists', () => {
  assert.equal(state({}).state, 'no-candidate');
});

test('keeps an open matching candidate PR reviewable', () => {
  const result = state({
    branchExists: true,
    pullRequests: [{ number: 42, state: 'OPEN', headRefName: inputs.branch }],
  });
  assert.equal(result.state, 'open-candidate-pr');
  assert.match(result.message, /#42/);
});

test('fails closed when duplicate matching candidate PRs exist', () => {
  const result = state({
    branchExists: true,
    pullRequests: [
      { number: 42, state: 'OPEN', headRefName: inputs.branch },
      { number: 43, state: 'open', headRefName: inputs.branch },
    ],
  });
  assert.equal(result.state, 'duplicate-open-candidate-prs');
  assert.match(result.message, /#42, #43/);
  assert.match(result.message, /Do not select or close either automatically/);
});

test('recognizes GitHub REST lowercase open states', () => {
  const result = state({
    branchExists: true,
    pullRequests: [{ number: 42, state: 'open', headRefName: inputs.branch }],
  });
  assert.equal(result.state, 'open-candidate-pr');
});

test('fails closed with an actionable diagnostic for a stranded branch', () => {
  const result = state({ branchExists: true });
  assert.equal(result.state, 'stranded-branch');
  assert.match(result.message, /release\/extension-v1\.2\.0/);
  assert.match(result.message, /cli-v1\.2\.0-a1b2c3d4e5f6/);
});

test('detects a PR-only inconsistency without recreating its branch', () => {
  const result = state({
    pullRequests: [{ number: 42, state: 'OPEN', headRefName: inputs.branch }],
  });
  assert.equal(result.state, 'pr-only-inconsistency');
});

test('does not recreate a merged or tagged candidate', () => {
  const merged = state({
    branchExists: true,
    pullRequests: [{ number: 42, state: 'MERGED', mergedAt: '2026-10-27T00:00:00Z', headRefName: inputs.branch }],
  });
  assert.equal(merged.state, 'merged-awaiting-tag');

  const tagged = state({
    branchExists: true,
    tagExists: true,
    pullRequests: [{ number: 42, state: 'MERGED', mergedAt: '2026-10-27T00:00:00Z', headRefName: inputs.branch }],
  });
  assert.equal(tagged.state, 'merged-and-tagged');
});

test('reports a version/branch mismatch before inspecting remote state', () => {
  const result = state({ branch: 'release/extension-v1.1.0' });
  assert.equal(result.state, 'mismatched-input');
  assert.match(result.message, /expected release\/extension-v1\.2\.0/);
});
