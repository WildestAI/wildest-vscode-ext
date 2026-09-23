import assert from 'node:assert/strict';
import test from 'node:test';
import { extensionVersionFromCliTag, selectAutomaticHandoff } from './resolve-automatic-handoff.mjs';

test('derives a matching extension version only from an immutable CLI tag', () => {
  assert.equal(extensionVersionFromCliTag('cli-v1.2.3-a1b2c3d4e5f6'), '1.2.3');
  assert.equal(extensionVersionFromCliTag('cli-v1.2.3'), undefined);
  assert.equal(extensionVersionFromCliTag('latest'), undefined);
});

test('selects the highest final immutable release newer than the extension', () => {
  const selected = selectAutomaticHandoff([
    { tag_name: 'cli-v1.0.7-a1b2c3d4e5f6', draft: false, prerelease: false, immutable: true },
    { tag_name: 'cli-v1.0.8-a1b2c3d4e5f6', draft: false, prerelease: false, immutable: false },
    { tag_name: 'cli-v1.1.0-a1b2c3d4e5f6', draft: true, prerelease: false, immutable: true },
    { tag_name: 'cli-v1.0.6-a1b2c3d4e5f6', draft: false, prerelease: false, immutable: true },
  ], '1.0.5');
  assert.deepEqual(selected, { cliReleaseTag: 'cli-v1.0.7-a1b2c3d4e5f6', extensionVersion: '1.0.7' });
});

test('skips when no final immutable release would advance the extension', () => {
  assert.equal(selectAutomaticHandoff([
    { tag_name: 'cli-v1.0.5-a1b2c3d4e5f6', draft: false, prerelease: false, immutable: true },
    { tag_name: 'cli-v1.0.6-a1b2c3d4e5f', draft: false, prerelease: false, immutable: true },
  ], '1.0.5'), undefined);
});
