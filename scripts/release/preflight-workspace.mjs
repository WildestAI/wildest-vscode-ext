const IGNORED_PATHS = new Set(['.git', 'node_modules', '.vscode-test', 'bin', '.release-preflight']);

export function shouldCopyPreflightPath(source) {
  return !IGNORED_PATHS.has(source.split(/[\\/]/).at(-1));
}
