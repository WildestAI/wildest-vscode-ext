import { CliRuntimeDiagnostics, CliRuntimeProbe } from '../services/CliService';

export interface RuntimeHealthRemediation {
	status: string;
	detail: string;
	canRestorePackagedExecutePermission: boolean;
}

/**
 * Returns the first runtime condition that prevents the packaged CLI from
 * serving DiffGraph. A launchable binary is not sufficient: its version and
 * schema probe must also be compatible with the extension.
 */
export function getRuntimeHealthRemediation(
	diagnostics: CliRuntimeDiagnostics,
	probe: CliRuntimeProbe,
): RuntimeHealthRemediation | undefined {
	if (diagnostics.status !== 'ready') {
		return {
			status: diagnostics.status,
			detail: diagnostics.detail,
			canRestorePackagedExecutePermission: diagnostics.source === 'packaged binary' &&
				diagnostics.status === 'permission-denied' && diagnostics.platform !== 'win32',
		};
	}
	if (probe.status !== 'compatible') {
		return { status: `compatibility ${probe.status}`, detail: probe.detail, canRestorePackagedExecutePermission: false };
	}
	return undefined;
}
