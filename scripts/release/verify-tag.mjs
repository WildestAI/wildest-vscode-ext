import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { IMMUTABLE_CLI_TAG_PATTERN, PENDING_RELEASE_TAG, readContract } from './release-contract.mjs';

const tag = process.env.GITHUB_REF_NAME;
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (tag !== `v${pkg.version}`) {
  throw new Error(`Tag ${tag ?? '(missing)'} must equal package version v${pkg.version}.`);
}
const contract = await readContract();
if (contract.releaseTag === PENDING_RELEASE_TAG) {
  throw new Error('The CLI release input is still pending. Set releaseTag to the immutable DiffGraph CLI GitHub release tag before tagging this extension.');
}
if (!IMMUTABLE_CLI_TAG_PATTERN.test(contract.releaseTag)) {
  throw new Error(`CLI release tag ${contract.releaseTag} is not an immutable cli-v<semver>-<12-char-sha> tag.`);
}
const encodedCommit = contract.releaseTag.slice(-12).toLowerCase();
const refs = execFileSync('git', [
  'ls-remote', `https://github.com/${contract.repository}.git`,
  `refs/tags/${contract.releaseTag}`, `refs/tags/${contract.releaseTag}^{}`,
], { encoding: 'utf8' });
const parsedRefs = refs.trim().split(/\r?\n/).map(line => line.split(/\s+/));
const resolvedCommit = parsedRefs.find(([, ref]) => ref === `refs/tags/${contract.releaseTag}^{}`)?.[0]
  ?? parsedRefs.find(([, ref]) => ref === `refs/tags/${contract.releaseTag}`)?.[0];
if (!resolvedCommit || !resolvedCommit.toLowerCase().startsWith(encodedCommit)) {
  throw new Error(`CLI release tag ${contract.releaseTag} does not resolve to its encoded commit ${encodedCommit}.`);
}
console.log(`Tag ${tag} and immutable CLI release input ${contract.releaseTag} are valid at ${resolvedCommit}.`);
