import * as assert from 'assert';
import { redactDiagnostics } from '../utils/redactDiagnostics';

suite('redactDiagnostics', () => {
	test('redacts credentials from common diagnostic error formats', () => {
		const detail = [
			'Authorization: Bearer token-value-123',
			'Authorization: Bearer "quoted-token-value-456"',
			'OPENAI_API_KEY=sk-secret_value-123456',
			'"apiKey": "json-secret-value-789"',
			'https://alice:password@example.test/v1',
			'https://example.test/v1?api_key=secret&token=another-secret',
		].join('\n');

		const redacted = redactDiagnostics(detail);

		assert.ok(!redacted.includes('token-value-123'));
		assert.ok(!redacted.includes('quoted-token-value-456'));
		assert.ok(!redacted.includes('sk-secret_value-123456'));
		assert.ok(!redacted.includes('json-secret-value-789'));
		assert.ok(!redacted.includes('alice:password'));
		assert.ok(!redacted.includes('another-secret'));
		assert.match(redacted, /Authorization: \[REDACTED\]/);
		assert.match(redacted, /OPENAI_API_KEY=\[REDACTED\]/);
		assert.match(redacted, /"apiKey": \[REDACTED\]/);
		assert.match(redacted, /https:\/\/\[REDACTED\]:\[REDACTED\]@example\.test/);
		assert.match(redacted, /api_key=\[REDACTED\]&token=\[REDACTED\]/);
	});

	test('preserves non-sensitive remediation context', () => {
		const detail = 'The CLI health probe failed. Reinstall the extension and run wild --version.';
		assert.strictEqual(redactDiagnostics(detail), detail);
	});
});
