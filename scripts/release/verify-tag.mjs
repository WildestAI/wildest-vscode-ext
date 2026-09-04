import { readFile } from 'node:fs/promises';
import { PENDING_RELEASE_TAG, readContract } from './release-contract.mjs';

const tag = process.env.GITHUB_REF_NAME;
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (tag !== `v${pkg.version}`) {
  throw new Error(`Tag ${tag ?? '(missing)'} must equal package version v${pkg.version}.`);
}
const contract = await readContract();
if (contract.releaseTag === PENDING_RELEASE_TAG) {
  throw new Error('The CLI release input is still pending. Set releaseTag to the immutable DiffGraph CLI GitHub release tag before tagging this extension.');
}
if (!/^cli-v\d+\.\d+\.\d+-[0-9a-f]{12}$/i.test(contract.releaseTag)) {
  throw new Error(`CLI release tag ${contract.releaseTag} is not an immutable cli-v<semver>-<12-char-sha> tag.`);
}
console.log(`Tag ${tag} and immutable CLI release input ${contract.releaseTag} are valid.`);
