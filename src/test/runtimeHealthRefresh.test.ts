import * as assert from 'assert';
import { createRuntimeHealthRefreshGate } from '../utils/runtimeHealthRefresh';

suite('createRuntimeHealthRefreshGate', () => {
	test('rejects an older result after a newer refresh starts', () => {
		const gate = createRuntimeHealthRefreshGate();
		const isFirstCurrent = gate.start();
		const isSecondCurrent = gate.start();

		assert.strictEqual(isFirstCurrent(), false);
		assert.strictEqual(isSecondCurrent(), true);
	});
});
