import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ASSETS } from './release-contract.mjs';

const MARKETPLACE_QUERY = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const OPEN_VSX_BASE = 'https://open-vsx.org/api';
const [publisher, extensionName, version] = process.argv.slice(2);

/** Refuses an incomplete direct smoke-check invocation. */
function requireArgument(value, name) {
  if (!value) throw new Error(`Usage: node scripts/release/verify-published-release.mjs <publisher> <extension-name> <version> (${name} is required).`);
  return value;
}

/** Returns the published VS Code Marketplace version list for one extension. */
export async function marketplaceVersions(fetchImpl, extensionId) {
  const response = await fetchImpl(MARKETPLACE_QUERY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
    body: JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: extensionId }] }],
      flags: 914,
    }),
  });
  if (!response.ok) throw new Error(`VS Code Marketplace query failed with HTTP ${response.status}.`);
  const payload = await response.json();
  const extension = payload.results?.[0]?.extensions?.find(item => `${item.publisher?.publisherName}.${item.extensionName}`.toLowerCase() === extensionId.toLowerCase());
  return extension?.versions?.map(item => item.version) ?? [];
}

/** Returns the latest published Open VSX version for one extension. */
export async function openVsxVersion(fetchImpl, publisherName, name) {
  const response = await fetchImpl(`${OPEN_VSX_BASE}/${encodeURIComponent(publisherName)}/${encodeURIComponent(name)}/latest`);
  if (!response.ok) throw new Error(`Open VSX query failed with HTTP ${response.status}.`);
  return (await response.json()).version;
}

/** Waits for both public registries to expose the exact published version. */
async function waitForPublishedVersion(fetchImpl, expectedVersion, attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [marketplace, openVsx] = await Promise.all([
        marketplaceVersions(fetchImpl, `${publisher}.${extensionName}`),
        openVsxVersion(fetchImpl, publisher, extensionName),
      ]);
      if (marketplace.includes(expectedVersion) && openVsx === expectedVersion) return;
      lastError = new Error(`Expected ${expectedVersion}; Marketplace has [${marketplace.join(', ')}], Open VSX has ${openVsx}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw lastError;
}

/** Downloads the public Marketplace VSIX and checks its required CLI paths. */
async function verifyMarketplaceVsix(fetchImpl) {
  const url = `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${extensionName}/${version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Marketplace VSIX download failed with HTTP ${response.status}.`);
  const directory = await mkdtemp(join(tmpdir(), 'wildest-published-vsix-'));
  const vsix = join(directory, 'extension.vsix');
  try {
    await writeFile(vsix, Buffer.from(await response.arrayBuffer()));
    const entries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' }).split('\n');
    for (const asset of REQUIRED_ASSETS) {
      if (!entries.includes(`extension/bin/${asset}`)) throw new Error(`Published VSIX is missing extension/bin/${asset}.`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireArgument(publisher, 'publisher');
  requireArgument(extensionName, 'extension-name');
  requireArgument(version, 'version');
  await waitForPublishedVersion(fetch, version);
  await verifyMarketplaceVsix(fetch);
  console.log(`Marketplace and Open VSX publish verification passed for ${publisher}.${extensionName}@${version}.`);
}
