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

export async function readContract() {
  let contract;
  try {
    contract = JSON.parse(await readFile(CONTRACT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${CONTRACT_PATH}: ${error.message}`);
  }

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
  if (typeof contract.releaseTag !== 'string' || !contract.releaseTag.trim()) {
    throw new Error('release input must include a releaseTag');
  }
  return contract;
}
