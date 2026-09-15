import { CliRuntimeDiagnostics, CliRuntimeProbe } from '../services/CliService';
import { redactDiagnostics } from './redactDiagnostics';

export interface RuntimeDiagnosticsReportInput {
	extensionVersion: string;
	diagnostics: CliRuntimeDiagnostics;
	probe: CliRuntimeProbe;
	provider: string;
	providerModel?: string;
	providerReadiness: string;
	providerDetail: string;
}

/**
 * Format a support-safe runtime report. Keep all credential-bearing fields
 * redacted here so every diagnostics surface uses the same safe output.
 */
export function formatRuntimeDiagnosticsReport(input: RuntimeDiagnosticsReportInput): string {
	const { diagnostics, probe } = input;
	return [
		'WildestAI runtime diagnostics',
		`Extension version: ${input.extensionVersion}`,
		`CLI source: ${diagnostics.source}`,
		`CLI status: ${diagnostics.status}`,
		`Platform: ${diagnostics.platform}/${diagnostics.architecture}`,
		`CLI path: ${diagnostics.executable ? redactDiagnostics(diagnostics.executable) : 'not available'}`,
		`CLI version: ${probe.cliVersion}`,
		`Artifact compatibility: ${probe.status}`,
		`Schema support: ${probe.schemaSupport}`,
		`Details: ${redactDiagnostics(diagnostics.detail)}`,
		`Probe details: ${redactDiagnostics(probe.detail)}`,
		`Provider: ${input.provider}`,
		`Provider model: ${input.providerModel ? redactDiagnostics(input.providerModel) : 'not applicable'}`,
		`Provider readiness: ${input.providerReadiness}`,
		`Provider details: ${redactDiagnostics(input.providerDetail)}`,
	].join('\n');
}
