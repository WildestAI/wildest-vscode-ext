import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REQUIRED_ASSETS } from './release-contract.mjs';
import { npmArgument, npmExecutable, npmExecutionOptions, requiresUnixExecutableModes, vsixExtractCommand, vsixListCommand } from './runtime-smoke-platform.mjs';
import { shouldCopyPreflightPath } from './preflight-workspace.mjs';

const workspace = await mkdtemp(join(tmpdir(), 'wildestai-release-preflight-'));
try {
  await cp('.', workspace, {
    recursive: true,
    filter: shouldCopyPreflightPath,
  });
  // A Windows directory junction works without the symlink privilege required
  // by ordinary (non-Developer-Mode) Windows accounts.
  await symlink(resolve('node_modules'), join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const bin = join(workspace, 'bin');
  const vsix = join(workspace, '.release-preflight', 'wildestai-preflight.vsix');
  await mkdir(bin, { recursive: true });
  for (const asset of REQUIRED_ASSETS) {
    const path = join(bin, asset);
    await writeFile(path, `preflight placeholder for ${asset}\n`);
    if (!asset.endsWith('.exe')) await chmod(path, 0o755);
  }
  const checksumLines = await Promise.all(REQUIRED_ASSETS.map(async asset => {
    const digest = createHash('sha256').update(await readFile(join(bin, asset))).digest('hex');
    return `${digest}  ${asset}`;
  }));
  await writeFile(join(bin, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`);
  execFileSync(npmExecutable(process.platform), ['run', 'package'], { cwd: workspace, stdio: 'inherit', ...npmExecutionOptions(process.platform) });
  await mkdir(join(workspace, '.release-preflight'), { recursive: true });
  execFileSync(npmExecutable(process.platform), ['run', 'package:vsix', '--', '--out', npmArgument(vsix, process.platform)], { cwd: workspace, stdio: 'inherit', ...npmExecutionOptions(process.platform) });
  const listCommand = vsixListCommand(vsix, process.platform);
  const entries = execFileSync(listCommand.executable, listCommand.args, {
    encoding: 'utf8',
    env: { ...process.env, ...listCommand.env },
  });
  for (const asset of REQUIRED_ASSETS) {
    if (!entries.split(/\r?\n/).includes(`extension/bin/${asset}`)) throw new Error(`VSIX is missing ${asset}`);
  }
  if (!entries.split(/\r?\n/).includes('extension/bin/SHA256SUMS')) throw new Error('VSIX is missing SHA256SUMS');

  // Verify the manifest after packaging, not just before it. This catches a
  // VSIX that carries every expected path but pairs a binary with a stale or
  // altered checksum; the installed extension would otherwise fail closed at runtime.
  const extracted = join(workspace, '.release-preflight', 'extracted');
  const extractCommand = vsixExtractCommand(vsix, extracted, process.platform);
  execFileSync(extractCommand.executable, extractCommand.args, {
    env: { ...process.env, ...extractCommand.env },
  });
  const packagedChecksums = new Map((await readFile(join(extracted, 'extension', 'bin', 'SHA256SUMS'), 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map(line => {
      const match = /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(line);
      if (!match) throw new Error(`VSIX contains an invalid checksum entry: ${line}`);
      return [match[2], match[1].toLowerCase()];
    }));
  for (const asset of REQUIRED_ASSETS) {
    const expected = packagedChecksums.get(asset);
    const actual = createHash('sha256').update(await readFile(join(extracted, 'extension', 'bin', asset))).digest('hex');
    if (!expected || expected !== actual) throw new Error(`VSIX checksum does not match packaged asset ${asset}`);
  }

  // Windows does not use POSIX execute bits; its packaged `.exe` artifact is
  // still covered by the required-path and checksum checks above.
  if (requiresUnixExecutableModes(process.platform)) {
    for (const asset of REQUIRED_ASSETS.filter(asset => !asset.endsWith('.exe'))) {
      const mode = (await stat(join(extracted, 'extension', 'bin', asset))).mode;
      if ((mode & 0o111) === 0) throw new Error(`VSIX does not preserve execute permission for ${asset}`);
    }
  }
  console.log(`VSIX packages all ${REQUIRED_ASSETS.length} required CLI binary paths${requiresUnixExecutableModes(process.platform) ? ' with executable Unix artifacts' : ''}.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
