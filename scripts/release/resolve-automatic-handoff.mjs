import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMMUTABLE_CLI_TAG_PATTERN } from './release-contract.mjs';

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parses a stable release version into comparable numeric components. */
function parseReleaseVersion(version) {
  const match = RELEASE_VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Extension version ${version} must be a stable x.y.z semver.`);
  return match.slice(1).map(Number);
}

/** Compares two stable extension release versions numerically. */
function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

/** Derives the matching extension semver from one immutable CLI tag. */
export function extensionVersionFromCliTag(tag) {
  if (!IMMUTABLE_CLI_TAG_PATTERN.test(tag)) return undefined;
  return /^cli-v(\d+\.\d+\.\d+)-/i.exec(tag)?.[1];
}

/** Selects the highest final immutable CLI release newer than the extension. */
export function selectAutomaticHandoff(releases, currentVersion) {
  parseReleaseVersion(currentVersion);
  const candidates = releases
    .filter(release => !release.draft && !release.prerelease && release.immutable)
    .map(release => ({ ...release, extensionVersion: extensionVersionFromCliTag(release.tag_name) }))
    .filter(release => release.extensionVersion && compareReleaseVersions(release.extensionVersion, currentVersion) > 0)
    .sort((left, right) => compareReleaseVersions(right.extensionVersion, left.extensionVersion));
  return candidates[0] && {
    cliReleaseTag: candidates[0].tag_name,
    extensionVersion: candidates[0].extensionVersion,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const currentVersion = process.argv[2];
  if (!currentVersion) throw new Error('Usage: node scripts/release/resolve-automatic-handoff.mjs <current-extension-version> <releases-json-path>');
  const releasesPath = process.argv[3];
  if (!releasesPath) throw new Error('A GitHub releases JSON path is required.');
  const selected = selectAutomaticHandoff(JSON.parse(await readFile(releasesPath, 'utf8')), currentVersion);
  if (selected) console.log(JSON.stringify(selected));
}
