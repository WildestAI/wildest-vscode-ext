import * as assert from 'assert';
import { presentRuntimeHealthFailure } from '../utils/runtimeHealthFailurePresentation';

suite('presentRuntimeHealthFailure', () => {
	test('keeps the status actionable while redacting unexpected error credentials', () => {
		const presentation = presentRuntimeHealthFailure(
			new Error('authorization: Bearer sk-live-super-secret-token at /home/alice/.vscode/extensions'),
		);

		assert.strictEqual(presentation.text, '$(warning) WildestAI CLI: check failed');
		assert.match(presentation.tooltip, /Open Runtime Diagnostics and recheck/);
		assert.doesNotMatch(presentation.diagnostics, /sk-live-super-secret-token|alice/);
		assert.match(presentation.diagnostics, /\[REDACTED\]/);
	});
});
