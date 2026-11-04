/**
 * Windows launches the bundled PE artifact without POSIX execute bits.
 * Unix release artifacts must retain execute permission inside the VSIX.
 */
export function requiresUnixExecutableModes(platform) {
  return platform !== 'win32';
}

/**
 * Returns the npm launcher available to Node on the selected operating system.
 */
export function npmExecutable(platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

/**
 * Supplies the execution options needed to launch the Windows npm command shim.
 */
export function npmExecutionOptions(platform) {
  // Node only runs .cmd launchers via a shell on Windows.
  return platform === 'win32' ? { shell: true } : {};
}

/**
 * Quotes an npm argument when the Windows command shell would split its path.
 */
export function npmArgument(value, platform) {
  // shell: true sends the command through cmd.exe, which splits unquoted spaces.
  return platform === 'win32' ? `"${value}"` : value;
}

/**
 * Returns a platform-supported command that lists every path in a VSIX archive.
 * Windows uses the .NET ZIP APIs bundled with PowerShell rather than Unix unzip.
 */
export function vsixListCommand(vsix, platform) {
  if (platform === 'win32') {
    return {
      executable: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '& { param([string]$Archive) Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead($Archive).Entries | ForEach-Object { $_.FullName } }',
        vsix,
      ],
    };
  }
  return { executable: 'unzip', args: ['-Z1', vsix] };
}
