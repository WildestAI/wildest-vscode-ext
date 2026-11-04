import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresUnixExecutableModes } from './runtime-smoke-platform.mjs';

test('requires executable-mode validation for supported Unix release platforms', () => {
  assert.equal(requiresUnixExecutableModes('linux'), true);
  assert.equal(requiresUnixExecutableModes('darwin'), true);
});

test('does not apply POSIX mode validation to the Windows PE runtime', () => {
  assert.equal(requiresUnixExecutableModes('win32'), false);
});
