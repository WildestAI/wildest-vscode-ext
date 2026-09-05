import assert from 'node:assert/strict';
import test from 'node:test';
import { PENDING_RELEASE_TAG, REQUIRED_ASSETS, validateContract } from './release-contract.mjs';

const contract = releaseTag => ({
  repository: 'WildestAI/DiffGraph-CLI',
  releaseTag,
  checksumAsset: 'SHA256SUMS',
  manifestAsset: 'cli-manifest.json',
  assets: REQUIRED_ASSETS,
});

test('accepts the pending immutable release marker', () => {
  assert.equal(validateContract(contract(PENDING_RELEASE_TAG)).releaseTag, PENDING_RELEASE_TAG);
});

test('accepts a CLI tag with a semver and 12-character commit suffix', () => {
  assert.equal(validateContract(contract('cli-v1.2.3-a1b2c3d4e5f6')).releaseTag, 'cli-v1.2.3-a1b2c3d4e5f6');
});

for (const releaseTag of ['latest', 'main', 'cli-v1.2.3-a1b2c3d4e5', 'cli-v1.2-a1b2c3d4e5f6']) {
  test(`rejects mutable or malformed release tag ${releaseTag}`, () => {
    assert.throws(() => validateContract(contract(releaseTag)), /releaseTag must be/);
  });
}
