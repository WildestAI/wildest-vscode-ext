import { redactDiagnostics } from './redactDiagnostics';

export interface RuntimeHealthFailurePresentation {
	text: string;
	tooltip: string;
	diagnostics: string;
}

/**
 * Keep the activation status useful if an unexpected runtime-health check
 * failure escapes the normal diagnostic classifications. Never surface raw
 * error text because it can include paths or provider credentials.
 */
export function presentRuntimeHealthFailure(error: unknown): RuntimeHealthFailurePresentation {
	const detail = redactDiagnostics(error instanceof Error ? error.message : String(error));
	const message = 'WildestAI could not complete the runtime health check. Open Runtime Diagnostics and recheck after reinstalling the extension if the problem persists.';

	return {
		text: '$(warning) WildestAI CLI: check failed',
		tooltip: `${message}\n\nDetails: ${detail || 'Unknown error.'}`,
		diagnostics: `${message}\nDetails: ${detail || 'Unknown error.'}`,
	};
}
