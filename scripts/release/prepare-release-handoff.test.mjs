import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReleaseHandoff, validateReleaseHandoff } from './prepare-release-handoff.mjs';
import { REQUIRED_ASSETS } from './release-contract.mjs';

const immutableTag = 'cli-v1.2.3-a1b2c3d4e5f6';

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'wildest-release-handoff-'));
  await mkdir(join(root, 'release-inputs'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'wildest-vscode-ext', version: '1.0.5' }));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ name: 'wildest-vscode-ext', version: '1.0.5', packages: { '': { version: '1.0.5' } } }));
  await writeFile(join(root, 'release-inputs', 'diffgraph-cli.json'), JSON.stringify({
    repository: 'WildestAI/DiffGraph-CLI',
    releaseTag: 'PENDING_IMMUTABLE_CLI_RELEASE',
    checksumAsset: 'SHA256SUMS',
    manifestAsset: 'cli-manifest.json',
    assets: REQUIRED_ASSETS,
  }));
  return root;
}

test('prepares package metadata and immutable CLI input together', async () => {
  const root = await createFixture();
  await prepareReleaseHandoff({ root, extensionVersion: '1.0.6', cliReleaseTag: immutableTag });
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'))).version, '1.0.6');
  assert.equal(JSON.parse(await readFile(join(root, 'package-lock.json'))).packages[''].version, '1.0.6');
  assert.equal(JSON.parse(await readFile(join(root, 'release-inputs', 'diffgraph-cli.json'))).releaseTag, immutableTag);
});

test('rejects a non-incrementing extension version', () => {
  assert.throws(
    () => validateReleaseHandoff({ currentVersion: '1.0.5', extensionVersion: '1.0.5', cliReleaseTag: immutableTag }),
    /must be greater/,
  );
});

test('rejects prerelease extension versions and mutable CLI tags', () => {
  assert.throws(
    () => validateReleaseHandoff({ currentVersion: '1.0.5', extensionVersion: '1.0.6-rc.1', cliReleaseTag: immutableTag }),
    /stable x\.y\.z semver/,
  );
  assert.throws(
    () => validateReleaseHandoff({ currentVersion: '1.0.5', extensionVersion: '1.0.6', cliReleaseTag: 'latest' }),
    /must be an immutable/,
  );
});

test('refuses to prepare from inconsistent package metadata', async () => {
  const root = await createFixture();
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': { version: '1.0.4' } } }));
  await assert.rejects(
    prepareReleaseHandoff({ root, extensionVersion: '1.0.6', cliReleaseTag: immutableTag }),
    /must equal package\.json version/,
  );
});

test('refuses to update a CLI input that violates the release contract', async () => {
  const root = await createFixture();
  await writeFile(join(root, 'release-inputs', 'diffgraph-cli.json'), JSON.stringify({ releaseTag: 'PENDING_IMMUTABLE_CLI_RELEASE' }));
  await assert.rejects(
    prepareReleaseHandoff({ root, extensionVersion: '1.0.6', cliReleaseTag: immutableTag }),
    /release input must identify/,
  );
});
