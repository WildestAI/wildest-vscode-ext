import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceVersions, openVsxVersion } from './verify-published-release.mjs';

const jsonResponse = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

test('reads Marketplace versions only for the requested extension', async () => {
  const versions = await marketplaceVersions(async (_url, request) => {
    assert.equal(request.method, 'POST');
    return jsonResponse({ results: [{ extensions: [
      { publisher: { publisherName: 'Other' }, extensionName: 'wildest-vscode-ext', versions: [{ version: '9.9.9' }] },
      { publisher: { publisherName: 'WildestAI' }, extensionName: 'wildest-vscode-ext', versions: [{ version: '1.0.6' }] },
    ] }] });
  }, 'WildestAI.wildest-vscode-ext');
  assert.deepEqual(versions, ['1.0.6']);
});

test('reads the Open VSX latest version and fails closed on HTTP errors', async () => {
  assert.equal(await openVsxVersion(async () => jsonResponse({ version: '1.0.6' }), 'WildestAI', 'wildest-vscode-ext'), '1.0.6');
  await assert.rejects(openVsxVersion(async () => jsonResponse({}, 404), 'WildestAI', 'wildest-vscode-ext'), /HTTP 404/);
});
