import assert from 'node:assert/strict';
import test from 'node:test';
import { npmArgument, npmExecutable, npmExecutionOptions, requiresUnixExecutableModes, vsixListCommand } from './runtime-smoke-platform.mjs';

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

test('lists VSIX paths with Windows built-in ZIP support rather than Unix unzip', () => {
  const vsix = 'C:\\Users\\Example User\\artifact.vsix';
  const command = vsixListCommand(vsix, 'win32');
  assert.equal(command.executable, 'powershell.exe');
  assert.deepEqual(command.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.match(command.args[3], /System\.IO\.Compression\.FileSystem/);
  assert.equal(command.args[4], vsix);
});

test('uses unzip to list VSIX paths on Unix release platforms', () => {
  assert.deepEqual(vsixListCommand('/tmp/artifact.vsix', 'linux'), {
    executable: 'unzip',
    args: ['-Z1', '/tmp/artifact.vsix'],
  });
});
