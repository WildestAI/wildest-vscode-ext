import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REQUIRED_ASSETS } from './release-contract.mjs';

const workspace = await mkdtemp(join(tmpdir(), 'wildestai-release-preflight-'));
const ignoredPaths = new Set(['.git', 'node_modules', '.vscode-test', 'bin', '.release-preflight']);
try {
  await cp('.', workspace, {
    recursive: true,
    filter: source => !ignoredPaths.has(source.split('/').at(-1)),
  });
  await symlink(resolve('node_modules'), join(workspace, 'node_modules'));
  const bin = join(workspace, 'bin');
  const vsix = join(workspace, '.release-preflight', 'wildestai-preflight.vsix');
  await mkdir(bin, { recursive: true });
  for (const asset of REQUIRED_ASSETS) await writeFile(join(bin, asset), `preflight placeholder for ${asset}\n`);
  execFileSync('npm', ['run', 'package'], { cwd: workspace, stdio: 'inherit' });
  await mkdir(join(workspace, '.release-preflight'), { recursive: true });
  execFileSync('npm', ['run', 'package:vsix', '--', '--out', vsix], { cwd: workspace, stdio: 'inherit' });
  const entries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' });
  for (const asset of REQUIRED_ASSETS) {
    if (!entries.split(/\r?\n/).includes(`extension/bin/${asset}`)) throw new Error(`VSIX is missing ${asset}`);
  }
  console.log(`VSIX packages all ${REQUIRED_ASSETS.length} required CLI binary paths.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
