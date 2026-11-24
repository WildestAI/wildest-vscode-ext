import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const workflowPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.github',
  'workflows',
  'release-preflight.yml',
);

test('runs the packaged-runtime smoke matrix when a bundled CLI binary changes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /^\s*- 'bin\/\*\*'$/m);
  assert.match(workflow, /packaged-runtime-smoke:/);
  assert.match(workflow, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(workflow, /npm run package:preflight/);
});
