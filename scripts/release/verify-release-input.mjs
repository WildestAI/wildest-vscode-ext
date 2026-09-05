import { readFile } from 'node:fs/promises';
import { REQUIRED_ASSETS, readContract } from './release-contract.mjs';

const contract = await readContract();
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const packagedAssets = Object.keys(pkg.bin ?? {}).sort();
if (packagedAssets.join('\n') !== [...REQUIRED_ASSETS].sort().join('\n')) {
  throw new Error(`package.json bin must declare exactly: ${REQUIRED_ASSETS.join(', ')}`);
}
for (const asset of REQUIRED_ASSETS) {
  if (pkg.bin[asset] !== `./bin/${asset}`) {
    throw new Error(`package.json bin.${asset} must point to ./bin/${asset}`);
  }
}
console.log(`Release input contract is valid for ${contract.repository}.`);
console.log(`CLI release tag: ${contract.releaseTag}`);
