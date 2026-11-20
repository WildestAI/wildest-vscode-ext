import { AiProviderPreflight, AiProviderProfile } from '../services/AiProviderProfileService';

export interface ProviderPreflightPresentation {
	severity: 'info' | 'warning';
	message: string;
}

/**
 * Keep provider setup truthful: saving a profile is distinct from proving that
 * its configured endpoint, model, and credentials are usable.
 */
export function presentProviderPreflight(
	profile: AiProviderProfile,
	preflight: AiProviderPreflight,
): ProviderPreflightPresentation {
	if (preflight.status === 'disabled') {
		return {
			severity: 'info',
			message: 'WildestAI optional AI prose is disabled. Deterministic workflows remain available.',
		};
	}
	if (preflight.status === 'ready') {
		return {
			severity: 'info',
			message: `WildestAI optional AI prose is configured for ${profile.provider} and passed a connection check.`,
		};
	}
	return {
		severity: 'warning',
		message: `WildestAI saved the ${profile.provider} profile, but the connection check needs attention: ${preflight.detail}`,
	};
}
