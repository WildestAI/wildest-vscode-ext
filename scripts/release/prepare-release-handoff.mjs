import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMMUTABLE_CLI_TAG_PATTERN, PENDING_RELEASE_TAG, validateContract } from './release-contract.mjs';

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

export function validateReleaseHandoff({ currentVersion, extensionVersion, cliReleaseTag }) {
  parseReleaseVersion(currentVersion);
  parseReleaseVersion(extensionVersion);
  if (compareReleaseVersions(extensionVersion, currentVersion) <= 0) {
    throw new Error(`Extension version ${extensionVersion} must be greater than the current version ${currentVersion}.`);
  }
  if (!IMMUTABLE_CLI_TAG_PATTERN.test(cliReleaseTag) || cliReleaseTag === PENDING_RELEASE_TAG) {
    throw new Error(`CLI release tag ${cliReleaseTag} must be an immutable cli-v<semver>-<12-char-sha> tag.`);
  }
}

/** Reads a JSON release-control file with an actionable path-specific error. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
}

/**
 * Applies the three release-input edits that must be reviewed together before
 * the existing tagged release workflow can publish a VSIX.
 */
export async function prepareReleaseHandoff({ root = '.', extensionVersion, cliReleaseTag, write = true }) {
  const packagePath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const contractPath = join(root, 'release-inputs', 'diffgraph-cli.json');
  const [pkg, lock, contract] = await Promise.all([readJson(packagePath), readJson(lockPath), readJson(contractPath)]);

  if (lock.packages?.['']?.version !== pkg.version) {
    throw new Error(`package-lock.json root version ${lock.packages?.['']?.version ?? '(missing)'} must equal package.json version ${pkg.version}.`);
  }
  validateContract(contract);
  validateReleaseHandoff({ currentVersion: pkg.version, extensionVersion, cliReleaseTag });

  if (!write) return { previousVersion: pkg.version, extensionVersion, cliReleaseTag };

  const previousVersion = pkg.version;
  pkg.version = extensionVersion;
  lock.version = extensionVersion;
  lock.packages[''].version = extensionVersion;
  contract.releaseTag = cliReleaseTag;
  await Promise.all([
    writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`),
    writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`),
    writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`),
  ]);
  return { previousVersion, extensionVersion, cliReleaseTag };
}

/** Parses the direct CLI invocation without accepting ambiguous input. */
function parseArguments(args) {
  const check = args[0] === '--check';
  const offset = check ? 1 : 0;
  const [extensionVersion, cliReleaseTag] = args.slice(offset);
  if (!extensionVersion || !cliReleaseTag || args.length !== offset + 2) {
    throw new Error('Usage: node scripts/release/prepare-release-handoff.mjs [--check] <extension-version> <immutable-cli-tag>');
  }
  return { check, extensionVersion, cliReleaseTag };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { check, extensionVersion, cliReleaseTag } = parseArguments(process.argv.slice(2));
  const result = await prepareReleaseHandoff({ extensionVersion, cliReleaseTag, write: !check });
  console.log(`${check ? 'Validated' : 'Prepared'} extension v${result.extensionVersion} for ${result.cliReleaseTag}.`);
}
