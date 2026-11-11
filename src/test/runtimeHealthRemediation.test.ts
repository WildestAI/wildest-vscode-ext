import * as assert from 'assert';
import { getRuntimeHealthRemediation } from '../utils/runtimeHealthRemediation';

suite('getRuntimeHealthRemediation', () => {
	const readyRuntime = {
		source: 'packaged binary' as const,
		status: 'ready' as const,
		platform: 'linux',
		architecture: 'x64',
		executable: '/extension/bin/wild-linux-x64',
		detail: 'The packaged CLI is available.',
	};

	test('does not prompt when the runtime and schema probe are compatible', () => {
		assert.strictEqual(getRuntimeHealthRemediation(readyRuntime, {
			status: 'compatible', cliVersion: '1.2.3', schemaSupport: 'schema v2', detail: 'Compatible.',
		}), undefined);
	});

	test('prefers a non-launchable runtime over its unavailable probe', () => {
		const remediation = getRuntimeHealthRemediation({
			...readyRuntime, status: 'missing', executable: undefined, detail: 'The packaged CLI is missing.',
		}, {
			status: 'unavailable', cliVersion: 'not available', schemaSupport: 'not checked', detail: 'Not run.',
		});

		assert.deepStrictEqual(remediation, {
			status: 'missing', detail: 'The packaged CLI is missing.',
		});
	});

	test('makes a schema-incompatible but launchable runtime actionable', () => {
		const remediation = getRuntimeHealthRemediation(readyRuntime, {
			status: 'incompatible', cliVersion: '1.2.3', schemaSupport: 'schema v3', detail: 'Update the CLI.',
		});

		assert.deepStrictEqual(remediation, {
			status: 'compatibility incompatible', detail: 'Update the CLI.',
		});
	});
});
