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

  const pullRequestPaths = workflow.match(
    /^  pull_request:\n    paths:\n(?<paths>(?:      - .+\n)+)/m,
  );
  assert.ok(pullRequestPaths?.groups?.paths, 'pull_request.paths is configured');
  assert.match(pullRequestPaths.groups.paths, /^      - 'bin\/\*\*'$/m);

  const packagedRuntimeSmoke = workflow.match(
    /^  packaged-runtime-smoke:\n(?<job>[\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\n|(?![\s\S]))/m,
  );
  assert.ok(packagedRuntimeSmoke?.groups?.job, 'packaged-runtime-smoke job is configured');
  assert.match(
    packagedRuntimeSmoke.groups.job,
    /^        os: \[ubuntu-latest, macos-latest, windows-latest\]$/m,
  );
  assert.match(packagedRuntimeSmoke.groups.job, /^        run: npm run package:preflight$/m);
});
