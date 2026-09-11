import * as assert from 'assert';
import { HistoryPerformanceSnapshot } from '../providers/HistoryViewProvider';
import {
	CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
	evaluateCachedGraphFirstPaintBudget,
	evaluateWarmHistoryBudget,
	WARM_HISTORY_BUDGET_MS,
} from '../utils/historyPerformanceBudget';

function snapshot(overrides: Partial<HistoryPerformanceSnapshot>): HistoryPerformanceSnapshot {
	return {
		source: 'none',
		repositoryDiscoveryMs: 0,
		cacheLookupMs: 0,
		gitFetchMs: undefined,
		graphBuildMs: 0,
		firstUsableGraphMs: undefined,
		totalMs: 0,
		...overrides,
	};
}

suite('History performance budgets', () => {
	test('passes a cache-backed load below the public warm-history budget', () => {
		const result = evaluateWarmHistoryBudget(snapshot({ source: 'cache', totalMs: 299.9 }));

		assert.deepStrictEqual(result, {
			status: 'pass', budgetMs: WARM_HISTORY_BUDGET_MS, measuredMs: 299.9,
		});
	});

	test('fails a cache-backed load at or above the public warm-history budget', () => {
		const result = evaluateWarmHistoryBudget(snapshot({ source: 'cache', totalMs: WARM_HISTORY_BUDGET_MS }));

		assert.deepStrictEqual(result, {
			status: 'fail', budgetMs: WARM_HISTORY_BUDGET_MS, measuredMs: WARM_HISTORY_BUDGET_MS,
		});
	});

	test('does not mislabel Git or empty loads as warm-cache measurements', () => {
		for (const source of ['git', 'none'] as const) {
			assert.deepStrictEqual(evaluateWarmHistoryBudget(snapshot({ source, totalMs: 1 })), {
				status: 'not-measured', budgetMs: WARM_HISTORY_BUDGET_MS,
			});
		}
	});

	test('measures cached graph first paint even when a forced Git refresh continues', () => {
		const result = evaluateCachedGraphFirstPaintBudget(snapshot({
			source: 'git', firstUsableGraphMs: 499.9, totalMs: 1_200,
		}));

		assert.deepStrictEqual(result, {
			status: 'pass', budgetMs: CACHED_GRAPH_FIRST_PAINT_BUDGET_MS, measuredMs: 499.9,
		});
	});

	test('fails cached graph first paint at the budget and ignores loads without a cache paint', () => {
		assert.deepStrictEqual(evaluateCachedGraphFirstPaintBudget(snapshot({
			firstUsableGraphMs: CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
		})), {
			status: 'fail', budgetMs: CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
			measuredMs: CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
		});
		assert.deepStrictEqual(evaluateCachedGraphFirstPaintBudget(snapshot({ source: 'git' })), {
			status: 'not-measured', budgetMs: CACHED_GRAPH_FIRST_PAINT_BUDGET_MS,
		});
	});
});
