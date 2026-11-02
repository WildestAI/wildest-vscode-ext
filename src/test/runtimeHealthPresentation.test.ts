import * as assert from 'assert';
import { presentRuntimeHealth } from '../utils/runtimeHealthPresentation';

suite('presentRuntimeHealth', () => {
	const readyRuntime = {
		source: 'packaged binary' as const,
		status: 'ready' as const,
		platform: 'linux',
		architecture: 'x64',
		executable: '/extension/bin/wild-linux-x64',
		detail: 'The packaged CLI is available.',
	};

	test('shows ready only when runtime and schema probe are compatible', () => {
		const presentation = presentRuntimeHealth(readyRuntime, {
			status: 'compatible', cliVersion: '1.2.3', schemaSupport: 'schema v2', detail: 'Compatible.',
		});

		assert.strictEqual(presentation.severity, 'ready');
		assert.strictEqual(presentation.text, '$(check) WildestAI CLI: ready');
	});

	test('shows an actionable warning for an unavailable packaged runtime', () => {
		const presentation = presentRuntimeHealth({
			...readyRuntime, status: 'missing', executable: undefined, detail: 'The packaged CLI is missing.',
		}, {
			status: 'unavailable', cliVersion: 'not available', schemaSupport: 'not checked', detail: 'Not run.',
		});

		assert.strictEqual(presentation.severity, 'warning');
		assert.strictEqual(presentation.text, '$(warning) WildestAI CLI: missing');
	});

	test('shows an actionable warning when the CLI schema probe is incompatible', () => {
		const presentation = presentRuntimeHealth(readyRuntime, {
			status: 'incompatible', cliVersion: '1.2.3', schemaSupport: 'schema v3', detail: 'Update the CLI.',
		});

		assert.strictEqual(presentation.severity, 'warning');
		assert.strictEqual(presentation.text, '$(warning) WildestAI CLI: incompatible');
	});
});
