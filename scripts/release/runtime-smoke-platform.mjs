/**
 * Windows launches the bundled PE artifact without POSIX execute bits.
 * Unix release artifacts must retain execute permission inside the VSIX.
 */
export function requiresUnixExecutableModes(platform) {
  return platform !== 'win32';
}

export function npmExecutable(platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function npmExecutionOptions(platform) {
  // Node only runs .cmd launchers via a shell on Windows.
  return platform === 'win32' ? { shell: true } : {};
}
