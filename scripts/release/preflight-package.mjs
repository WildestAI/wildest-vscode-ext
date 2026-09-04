import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REQUIRED_ASSETS } from './release-contract.mjs';

const bin = 'bin';
const vsix = '.release-preflight/wildestai-preflight.vsix';
await mkdir(bin, { recursive: true });
try {
  for (const asset of REQUIRED_ASSETS) await writeFile(join(bin, asset), `preflight placeholder for ${asset}\n`);
  execFileSync('npm', ['run', 'package'], { stdio: 'inherit' });
  await mkdir('.release-preflight', { recursive: true });
  execFileSync('npm', ['run', 'package:vsix', '--', '--out', vsix], { stdio: 'inherit' });
  const entries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' });
  for (const asset of REQUIRED_ASSETS) {
    if (!entries.split(/\r?\n/).includes(`extension/bin/${asset}`)) throw new Error(`VSIX is missing ${asset}`);
  }
  console.log(`VSIX packages all ${REQUIRED_ASSETS.length} required CLI binary paths.`);
} finally {
  await rm(bin, { recursive: true, force: true });
  await rm('.release-preflight', { recursive: true, force: true });
}
