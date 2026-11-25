import * as assert from 'assert';
import { presentRuntimeHealthRecheck } from '../utils/runtimeHealthRecheckPresentation';

suite('presentRuntimeHealthRecheck', () => {
	const readyRuntime = {
		source: 'packaged binary' as const,
		status: 'ready' as const,
		platform: 'linux',
		architecture: 'x64',
		executable: '/extension/bin/wild-linux-x64',
		detail: 'The packaged CLI is available.',
	};
	const compatibleProbe = {
		status: 'compatible' as const,
		cliVersion: '1.2.3',
		schemaSupport: 'schema v2',
		detail: 'Compatible.',
	};

	test('reports ready only when the CLI and optional provider are ready', () => {
		assert.deepStrictEqual(presentRuntimeHealthRecheck(readyRuntime, compatibleProbe, 'ready'), {
			severity: 'info',
			message: 'WildestAI runtime health is ready.',
		});
	});

	test('explains that deterministic workflows remain ready when AI is intentionally off', () => {
		assert.deepStrictEqual(presentRuntimeHealthRecheck(readyRuntime, compatibleProbe, 'disabled'), {
			severity: 'info',
			message: 'WildestAI CLI and deterministic DiffGraph workflows are ready. Optional AI prose is off.',
		});
	});

	test('warns when optional AI setup is incomplete without treating it as a CLI failure', () => {
		assert.deepStrictEqual(presentRuntimeHealthRecheck(readyRuntime, compatibleProbe, 'needs-configuration'), {
			severity: 'warning',
			message: 'WildestAI CLI and deterministic DiffGraph workflows are ready. Optional AI prose still needs configuration.',
		});
	});

	test('warns with the actionable runtime reason instead of reporting a generic successful recheck', () => {
		assert.deepStrictEqual(presentRuntimeHealthRecheck({
			...readyRuntime,
			status: 'missing',
			executable: undefined,
			detail: 'The packaged CLI is missing.',
		}, {
			status: 'unavailable', cliVersion: 'not available', schemaSupport: 'not checked', detail: 'Not run.',
		}, 'disabled'), {
			severity: 'warning',
			message: 'WildestAI runtime health needs attention (missing): The packaged CLI is missing.',
		});
	});
});
