import * as assert from 'assert';
import {
	STRUCTURAL_DIFF_BUDGET_MS,
	evaluateStructuralDiffBudget,
} from '../utils/diffGraphPerformanceBudget';

suite('DiffGraph performance budget', () => {
	test('does not treat an absent structural-diff sample as passing', () => {
		assert.deepStrictEqual(evaluateStructuralDiffBudget(), {
			budgetMs: STRUCTURAL_DIFF_BUDGET_MS,
			status: 'not-measured',
		});
	});

	test('reports structural-diff samples against the published budget', () => {
		assert.deepStrictEqual(evaluateStructuralDiffBudget(1_999), {
			budgetMs: STRUCTURAL_DIFF_BUDGET_MS,
			measuredMs: 1_999,
			status: 'met',
		});
		assert.deepStrictEqual(evaluateStructuralDiffBudget(2_000), {
			budgetMs: STRUCTURAL_DIFF_BUDGET_MS,
			measuredMs: 2_000,
			status: 'not-met',
		});
	});
});
