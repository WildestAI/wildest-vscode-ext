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
        'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead($env:WILDESTAI_VSIX_PATH).Entries | ForEach-Object { $_.FullName }',
      ],
      env: { WILDESTAI_VSIX_PATH: vsix },
    };
  }
  return { executable: 'unzip', args: ['-Z1', vsix] };
}

/** Extract a VSIX without interpolating a potentially space-containing path into shell text. */
export function vsixExtractCommand(vsix, destination, platform) {
  if (platform === 'win32') {
    return {
      executable: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:WILDESTAI_VSIX_PATH, $env:WILDESTAI_VSIX_EXTRACTED_PATH)',
      ],
      env: { WILDESTAI_VSIX_PATH: vsix, WILDESTAI_VSIX_EXTRACTED_PATH: destination },
    };
  }
  return { executable: 'unzip', args: ['-qq', vsix, '-d', destination] };
}

/**
 * Parse a packaged CLI checksum manifest and require one valid digest for each
 * expected asset. Duplicate or untracked entries make the packaged artifact
 * ambiguous, so fail the preflight before it can reach users.
 */
export function parseRequiredAssetChecksums(manifest, requiredAssets) {
  const expectedAssets = new Set(requiredAssets);
  const checksums = new Map();
  for (const line of manifest.trim().split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(line);
    if (!match) throw new Error(`VSIX contains an invalid checksum entry: ${line}`);
    const asset = match[2];
    if (!expectedAssets.has(asset)) throw new Error(`VSIX checksum manifest contains an unexpected asset: ${asset}`);
    if (checksums.has(asset)) throw new Error(`VSIX checksum manifest contains a duplicate asset: ${asset}`);
    checksums.set(asset, match[1].toLowerCase());
  }
  for (const asset of requiredAssets) {
    if (!checksums.has(asset)) throw new Error(`VSIX checksum manifest is missing required asset: ${asset}`);
  }
  return checksums;
}
