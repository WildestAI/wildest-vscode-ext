/**
 * Ensures asynchronous status refreshes cannot replace a newer result.
 */
export function createRuntimeHealthRefreshGate() {
	let latestRefresh = 0;

	return {
		start(): () => boolean {
			const refresh = ++latestRefresh;
			return () => refresh === latestRefresh;
		},
	};
}
