import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { REQUIRED_ASSETS, readContract } from './release-contract.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/release/verify-cli-release.mjs <download-directory>');
const contract = await readContract();
const expected = [...REQUIRED_ASSETS, contract.checksumAsset, contract.manifestAsset].sort();
const actual = (await readdir(dir)).sort();
if (actual.join('\n') !== expected.join('\n')) {
  throw new Error(`CLI release assets differ from the locked contract. Expected ${expected.join(', ')}; got ${actual.join(', ')}`);
}
const checksumText = await readFile(join(dir, contract.checksumAsset), 'utf8');
const checksums = new Map();
for (const line of checksumText.trim().split(/\r?\n/)) {
  const match = /^([a-fA-F0-9]{64}) [ *](wild-(?:macos-(?:arm64|x64)|linux-(?:arm64|x64)|win\.exe))$/.exec(line);
  if (!match || checksums.has(match[2])) throw new Error(`Invalid or duplicate checksum entry: ${line}`);
  checksums.set(match[2], match[1].toLowerCase());
}
if ([...checksums.keys()].sort().join('\n') !== [...REQUIRED_ASSETS].sort().join('\n')) {
  throw new Error('SHA256SUMS must contain one checksum for each required CLI binary and no others.');
}
for (const asset of REQUIRED_ASSETS) {
  const digest = createHash('sha256').update(await readFile(join(dir, asset))).digest('hex');
  if (digest !== checksums.get(asset)) throw new Error(`Checksum mismatch for ${asset}.`);
}
console.log(`Verified ${REQUIRED_ASSETS.length} DiffGraph CLI binaries against ${contract.checksumAsset}.`);
