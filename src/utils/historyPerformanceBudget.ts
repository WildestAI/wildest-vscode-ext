import { HistoryPerformanceSnapshot } from '../providers/HistoryViewProvider';

export const WARM_HISTORY_BUDGET_MS = 300;
export const CACHED_GRAPH_FIRST_PAINT_BUDGET_MS = 500;

export type HistoryBudgetStatus = 'pass' | 'fail' | 'not-measured';

export interface HistoryBudgetResult {
	status: HistoryBudgetStatus;
	budgetMs: number;
	measuredMs?: number;
}

/**
 * Evaluate the warm-history target only for an initial cache-backed history
 * load. Cold or forced refreshes intentionally remain "not measured": their
 * Git work has a different performance envelope and must not be presented as
 * a warm-cache regression.
 */
export function evaluateWarmHistoryBudget(
	snapshot: HistoryPerformanceSnapshot,
): HistoryBudgetResult {
	return evaluateBudget(
		snapshot.source === 'cache' ? snapshot.totalMs : undefined,
		WARM_HISTORY_BUDGET_MS,
	);
}

/**
 * Evaluate the time to first usable graph when a cached graph was shown.
 * This remains meaningful even when a forced Git refresh continues after the
 * cache paint, because it measures the user-visible result rather than the
 * eventual background refresh.
 */
export function evaluateCachedGraphFirstPaintBudget(
	snapshot: HistoryPerformanceSnapshot,
): HistoryBudgetResult {
	return evaluateBudget(
		snapshot.firstUsableGraphMs,
		CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
	);
}

function evaluateBudget(
	measuredMs: number | undefined,
	budgetMs: number,
): HistoryBudgetResult {
	if (measuredMs === undefined) {
		return { status: 'not-measured', budgetMs };
	}

	return {
		status: measuredMs < budgetMs ? 'pass' : 'fail',
		budgetMs,
		measuredMs,
	};
}
