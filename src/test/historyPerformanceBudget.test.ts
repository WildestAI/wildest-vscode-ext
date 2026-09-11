import * as assert from 'assert';
import { HistoryPerformanceSnapshot } from '../providers/HistoryViewProvider';
import {
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
		totalMs: 0,
		...overrides,
	};
}

suite('Warm history performance budget', () => {
	test('passes a cache-backed load below the public budget', () => {
		const result = evaluateWarmHistoryBudget(snapshot({ source: 'cache', totalMs: 299.9 }));

		assert.deepStrictEqual(result, {
			status: 'pass', budgetMs: WARM_HISTORY_BUDGET_MS, measuredMs: 299.9,
		});
	});

	test('fails a cache-backed load at or above the public budget', () => {
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
});
