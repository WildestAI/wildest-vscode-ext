import assert from 'node:assert/strict';
import test from 'node:test';
import { npmArgument, npmExecutable, npmExecutionOptions, requiresUnixExecutableModes, vsixExtractCommand, vsixListCommand } from './runtime-smoke-platform.mjs';

test('requires executable-mode validation for supported Unix release platforms', () => {
  assert.equal(requiresUnixExecutableModes('linux'), true);
  assert.equal(requiresUnixExecutableModes('darwin'), true);
});

test('does not apply POSIX mode validation to the Windows PE runtime', () => {
  assert.equal(requiresUnixExecutableModes('win32'), false);
});

test('uses the Windows command shim when invoking npm from Node', () => {
  assert.equal(npmExecutable('win32'), 'npm.cmd');
  assert.equal(npmExecutable('linux'), 'npm');
  assert.equal(npmExecutable('darwin'), 'npm');
});

test('uses a shell only for the Windows npm command shim', () => {
  assert.deepEqual(npmExecutionOptions('win32'), { shell: true });
  assert.deepEqual(npmExecutionOptions('linux'), {});
});

test('quotes npm arguments containing Windows paths when using the command shell', () => {
  const pathWithSpaces = 'C:\\Users\\Example User\\AppData\\Local\\Temp\\artifact.vsix';
  assert.equal(npmArgument(pathWithSpaces, 'win32'), `"${pathWithSpaces}"`);
  assert.equal(npmArgument(pathWithSpaces, 'linux'), pathWithSpaces);
});

test('passes Windows VSIX paths through the environment rather than PowerShell command text', () => {
  const vsix = 'C:\\Users\\Example User\\artifact.vsix';
  const command = vsixListCommand(vsix, 'win32');
  assert.equal(command.executable, 'powershell.exe');
  assert.deepEqual(command.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.match(command.args[3], /System\.IO\.Compression\.FileSystem/);
  assert.match(command.args[3], /\$env:WILDESTAI_VSIX_PATH/);
  assert.deepEqual(command.env, { WILDESTAI_VSIX_PATH: vsix });
  assert.equal(command.args.includes(vsix), false);
});

test('uses unzip to list VSIX paths on Unix release platforms', () => {
  assert.deepEqual(vsixListCommand('/tmp/artifact.vsix', 'linux'), {
    executable: 'unzip',
    args: ['-Z1', '/tmp/artifact.vsix'],
  });
});

test('extracts Windows VSIX paths through environment variables', () => {
  const command = vsixExtractCommand('C:\\Users\\Example User\\artifact.vsix', 'C:\\Users\\Example User\\extracted', 'win32');
  assert.equal(command.executable, 'powershell.exe');
  assert.match(command.args[3], /ZipFile]::ExtractToDirectory/);
  assert.match(command.args[3], /WILDESTAI_VSIX_PATH/);
  assert.match(command.args[3], /WILDESTAI_VSIX_EXTRACTED_PATH/);
  assert.deepEqual(command.env, {
    WILDESTAI_VSIX_PATH: 'C:\\Users\\Example User\\artifact.vsix',
    WILDESTAI_VSIX_EXTRACTED_PATH: 'C:\\Users\\Example User\\extracted',
  });
});

test('uses unzip to extract VSIX files on Unix release platforms', () => {
  assert.deepEqual(vsixExtractCommand('/tmp/artifact.vsix', '/tmp/extracted', 'darwin'), {
    executable: 'unzip',
    args: ['-qq', '/tmp/artifact.vsix', '-d', '/tmp/extracted'],
  });
});
