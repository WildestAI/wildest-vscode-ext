import { CliRuntimeDiagnostics, CliRuntimeProbe } from '../services/CliService';

export interface RuntimeHealthPresentation {
	text: string;
	severity: 'ready' | 'warning';
}

/**
 * Keep the first-run indicator concise. The full, redacted report remains
 * available from its command and status-bar tooltip.
 */
export function presentRuntimeHealth(
	diagnostics: CliRuntimeDiagnostics,
	probe: CliRuntimeProbe,
): RuntimeHealthPresentation {
	if (diagnostics.status !== 'ready') {
		return {
			text: `$(warning) WildestAI CLI: ${diagnostics.status}`,
			severity: 'warning',
		};
	}

	if (probe.status !== 'compatible') {
		return {
			text: `$(warning) WildestAI CLI: ${probe.status}`,
			severity: 'warning',
		};
	}

	return {
		text: '$(check) WildestAI CLI: ready',
		severity: 'ready',
	};
}
