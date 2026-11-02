import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
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
  for (const asset of REQUIRED_ASSETS) {
    const path = join(bin, asset);
    await writeFile(path, `preflight placeholder for ${asset}\n`);
    if (!asset.endsWith('.exe')) await chmod(path, 0o755);
  }
  execFileSync('npm', ['run', 'package'], { cwd: workspace, stdio: 'inherit' });
  await mkdir(join(workspace, '.release-preflight'), { recursive: true });
  execFileSync('npm', ['run', 'package:vsix', '--', '--out', vsix], { cwd: workspace, stdio: 'inherit' });
  const entries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' });
  for (const asset of REQUIRED_ASSETS) {
    if (!entries.split(/\r?\n/).includes(`extension/bin/${asset}`)) throw new Error(`VSIX is missing ${asset}`);
  }
  const extracted = join(workspace, '.release-preflight', 'extracted');
  execFileSync('unzip', ['-qq', vsix, '-d', extracted]);
  for (const asset of REQUIRED_ASSETS.filter(asset => !asset.endsWith('.exe'))) {
    const mode = (await stat(join(extracted, 'extension', 'bin', asset))).mode;
    if ((mode & 0o111) === 0) throw new Error(`VSIX does not preserve execute permission for ${asset}`);
  }
  console.log(`VSIX packages all ${REQUIRED_ASSETS.length} required CLI binary paths with executable Unix artifacts.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
