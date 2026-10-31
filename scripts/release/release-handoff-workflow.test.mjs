import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflow = new URL('../../.github/workflows/release-handoff.yml', import.meta.url);

test('release handoff preserves a missing remote ref as a non-error probe result', async () => {
  const source = await readFile(workflow, 'utf8');

  assert.match(source, /if output="\$\(git ls-remote --exit-code "\$kind" origin "\$ref" 2>&1\)"; then\n\s+return 0\n\s+else\n(?:\s+#.*\n)+\s+status=\$\?\n\s+fi\n\s+if \[ "\$status" -eq 2 \]; then\n\s+return 1/);
});
