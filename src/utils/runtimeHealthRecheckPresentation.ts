import { CliRuntimeDiagnostics, CliRuntimeProbe } from '../services/CliService';
import { getRuntimeHealthRemediation } from './runtimeHealthRemediation';

export interface RuntimeHealthRecheckPresentation {
	severity: 'info' | 'warning';
	message: string;
}

/**
 * A completed recheck must report whether the runtime is usable, rather than
 * implying success merely because the diagnostic command finished.
 */
export function presentRuntimeHealthRecheck(
	diagnostics: CliRuntimeDiagnostics,
	probe: CliRuntimeProbe,
	providerReadiness: 'disabled' | 'ready' | 'needs-configuration',
): RuntimeHealthRecheckPresentation {
	const remediation = getRuntimeHealthRemediation(diagnostics, probe);
	if (remediation) {
		return {
			severity: 'warning',
			message: `WildestAI runtime health needs attention (${remediation.status}): ${remediation.detail}`,
		};
	}

	if (providerReadiness === 'needs-configuration') {
		return {
			severity: 'warning',
			message: 'WildestAI CLI and deterministic DiffGraph workflows are ready. Optional AI prose still needs configuration.',
		};
	}

	return {
		severity: 'info',
		message: providerReadiness === 'disabled'
			? 'WildestAI CLI and deterministic DiffGraph workflows are ready. Optional AI prose is off.'
			: 'WildestAI runtime health is ready.',
	};
}
