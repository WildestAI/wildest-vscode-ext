import * as assert from 'assert';
import { formatRuntimeDiagnosticsReport } from '../utils/runtimeDiagnosticsReport';

suite('formatRuntimeDiagnosticsReport', () => {
	test('includes actionable runtime state while redacting credentials', () => {
		const report = formatRuntimeDiagnosticsReport({
			extensionVersion: '1.2.3',
			diagnostics: {
				source: 'packaged binary',
				status: 'permission-denied',
				platform: 'linux',
				architecture: 'x64',
				executable: '/extension/bin/wild-linux-x64',
				detail: 'Authorization: Bearer runtime-secret',
			},
			probe: {
				status: 'unavailable',
				cliVersion: 'not available',
				schemaSupport: 'not checked',
				detail: 'OPENAI_API_KEY=probe-secret',
			},
			provider: 'openai-compatible',
			providerModel: 'local-model',
			providerReadiness: 'ready',
			providerDetail: 'https://user:provider-secret@example.test/v1',
		});

		assert.match(report, /Extension version: 1\.2\.3/);
		assert.match(report, /CLI status: permission-denied/);
		assert.match(report, /CLI path: \/extension\/bin\/wild-linux-x64/);
		assert.match(report, /Provider: openai-compatible/);
		assert.match(report, /Provider model: local-model/);
		assert.ok(!report.includes('runtime-secret'));
		assert.ok(!report.includes('probe-secret'));
		assert.ok(!report.includes('user:provider-secret'));
		assert.match(report, /Authorization: \[REDACTED\]/);
		assert.match(report, /OPENAI_API_KEY=\[REDACTED\]/);
	});

	test('uses explicit fallbacks for unavailable runtime fields', () => {
		const report = formatRuntimeDiagnosticsReport({
			extensionVersion: 'unknown',
			diagnostics: {
				source: 'packaged binary', status: 'unsupported', platform: 'win32', architecture: 'arm64',
				detail: 'No packaged CLI is available.',
			},
			probe: { status: 'unavailable', cliVersion: 'not available', schemaSupport: 'not checked', detail: 'Not run.' },
			provider: 'disabled',
			providerReadiness: 'disabled',
			providerDetail: 'AI prose is disabled.',
		});

		assert.match(report, /CLI path: not available/);
		assert.match(report, /Provider model: not applicable/);
	});
});
