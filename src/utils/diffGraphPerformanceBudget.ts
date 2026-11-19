export const STRUCTURAL_DIFF_BUDGET_MS = 2_000;

export interface PerformanceBudgetResult {
	budgetMs: number;
	measuredMs?: number;
	status: 'met' | 'not-met' | 'not-measured';
}

/**
 * Evaluate the P0 structural-diff budget without treating an absent sample as a
 * passing result. The sample measures CLI generation plus presentation handoff,
 * not cache lookup or end-to-end command latency.
 */
export function evaluateStructuralDiffBudget(measuredMs?: number): PerformanceBudgetResult {
	if (measuredMs === undefined) {
		return { budgetMs: STRUCTURAL_DIFF_BUDGET_MS, status: 'not-measured' };
	}
	return {
		budgetMs: STRUCTURAL_DIFF_BUDGET_MS,
		measuredMs,
		status: measuredMs < STRUCTURAL_DIFF_BUDGET_MS ? 'met' : 'not-met',
	};
}
