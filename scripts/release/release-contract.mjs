import { readFile } from 'node:fs/promises';

export const REQUIRED_ASSETS = [
  'wild-macos-arm64',
  'wild-macos-x64',
  'wild-linux-arm64',
  'wild-linux-x64',
  'wild-win.exe',
];
export const CONTRACT_PATH = 'release-inputs/diffgraph-cli.json';
export const PENDING_RELEASE_TAG = 'PENDING_IMMUTABLE_CLI_RELEASE';
export const IMMUTABLE_CLI_TAG_PATTERN = /^cli-v\d+\.\d+\.\d+-[0-9a-f]{12}$/i;

/**
 * Validates the release contract against the required repository, assets, checksum and manifest files, and release tag policy.
 * @param {Object} contract - The release contract to validate.
 * @returns {Object} The validated release contract.
 * @throws {Error} If the contract does not satisfy the required release-input rules.
 */
export function validateContract(contract) {
  if (contract.repository !== 'WildestAI/DiffGraph-CLI') {
    throw new Error('release input must identify WildestAI/DiffGraph-CLI');
  }
  if (!Array.isArray(contract.assets) || contract.assets.length !== REQUIRED_ASSETS.length ||
      [...contract.assets].sort().join('\n') !== [...REQUIRED_ASSETS].sort().join('\n')) {
    throw new Error(`release input must declare exactly: ${REQUIRED_ASSETS.join(', ')}`);
  }
  if (contract.checksumAsset !== 'SHA256SUMS' || contract.manifestAsset !== 'cli-manifest.json') {
    throw new Error('release input must require SHA256SUMS and cli-manifest.json');
  }
  if (contract.releaseTag !== PENDING_RELEASE_TAG &&
      (typeof contract.releaseTag !== 'string' || !IMMUTABLE_CLI_TAG_PATTERN.test(contract.releaseTag))) {
    throw new Error(`release input releaseTag must be ${PENDING_RELEASE_TAG} or an immutable cli-v<semver>-<12-char-sha> tag`);
  }
  return contract;
}

/**
 * Read and validate the release contract.
 * @returns {object} The validated release contract.
 * @throws {Error} If the contract cannot be read, parsed, or validated.
 */
export async function readContract() {
  let contract;
  try {
    contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${CONTRACT_PATH}: ${error.message}`);
  }
  return validateContract(contract);
}
