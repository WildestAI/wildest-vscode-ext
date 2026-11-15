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
	providerReadiness?: 'disabled' | 'ready' | 'needs-configuration',
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

	if (providerReadiness === 'needs-configuration') {
		return {
			text: '$(warning) WildestAI CLI: ready · AI: needs configuration',
			severity: 'warning',
		};
	}

	return {
		text: providerReadiness === 'disabled'
			? '$(check) WildestAI CLI: ready · AI: off'
			: '$(check) WildestAI CLI: ready',
		severity: 'ready',
	};
}
