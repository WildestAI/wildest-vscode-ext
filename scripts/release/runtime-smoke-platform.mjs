/**
 * Windows launches the bundled PE artifact without POSIX execute bits.
 * Unix release artifacts must retain execute permission inside the VSIX.
 */
export function requiresUnixExecutableModes(platform) {
  return platform !== 'win32';
}
