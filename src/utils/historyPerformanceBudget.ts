import { HistoryPerformanceSnapshot } from '../providers/HistoryViewProvider';

export const WARM_HISTORY_BUDGET_MS = 300;

export type WarmHistoryBudgetStatus = 'pass' | 'fail' | 'not-measured';

export interface WarmHistoryBudgetResult {
	status: WarmHistoryBudgetStatus;
	budgetMs: number;
	measuredMs?: number;
}

/**
 * Evaluate only an initial, cache-backed history load against the public P0
 * budget. Cold or forced refreshes intentionally remain "not measured": their
 * Git work has a different performance envelope and must not be presented as a
 * warm-cache regression.
 */
export function evaluateWarmHistoryBudget(
	snapshot: HistoryPerformanceSnapshot,
): WarmHistoryBudgetResult {
	if (snapshot.source !== 'cache') {
		return { status: 'not-measured', budgetMs: WARM_HISTORY_BUDGET_MS };
	}

	return {
		status: snapshot.totalMs < WARM_HISTORY_BUDGET_MS ? 'pass' : 'fail',
		budgetMs: WARM_HISTORY_BUDGET_MS,
		measuredMs: snapshot.totalMs,
	};
}
