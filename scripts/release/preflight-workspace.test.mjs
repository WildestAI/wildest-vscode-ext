import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCopyPreflightPath } from './preflight-workspace.mjs';

test('excludes generated and dependency directories for POSIX and Windows source paths', () => {
  for (const separator of ['/', '\\']) {
    assert.equal(shouldCopyPreflightPath(`workspace${separator}node_modules`), false);
    assert.equal(shouldCopyPreflightPath(`workspace${separator}.git`), false);
  }
  assert.equal(shouldCopyPreflightPath('workspace/src'), true);
});
