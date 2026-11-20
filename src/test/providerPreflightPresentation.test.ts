import * as assert from 'assert';
import { AiProviderPreflight, AiProviderProfile } from '../services/AiProviderProfileService';
import { presentProviderPreflight } from '../utils/providerPreflightPresentation';

const openAiProfile: AiProviderProfile = {
	provider: 'openai',
	baseUrl: 'https://api.openai.com/v1',
	model: 'gpt-4.1-mini',
	capabilities: ['prose'],
	authSource: 'secret-storage',
};

function preflight(status: AiProviderPreflight['status'], detail: string): AiProviderPreflight {
	return { status, detail };
}

suite('presentProviderPreflight', () => {
	test('confirms a configured provider only after it passes preflight', () => {
		assert.deepStrictEqual(presentProviderPreflight(openAiProfile, preflight('ready', 'OpenAI accepted the configured model.')), {
			severity: 'info',
			message: 'WildestAI optional AI prose is configured for openai and passed a connection check.',
		});
	});

	test('keeps AI-off setup informational', () => {
		const disabled: AiProviderProfile = { provider: 'disabled', capabilities: [], authSource: 'none' };
		assert.deepStrictEqual(presentProviderPreflight(disabled, preflight('disabled', 'AI prose enrichment is disabled.')), {
			severity: 'info',
			message: 'WildestAI optional AI prose is disabled. Deterministic workflows remain available.',
		});
	});

	test('warns with the actionable preflight detail when saved credentials cannot be used', () => {
		assert.deepStrictEqual(presentProviderPreflight(openAiProfile, preflight('credits-unavailable', 'openai reported unavailable or expired account credits.')), {
			severity: 'warning',
			message: 'WildestAI saved the openai profile, but the connection check needs attention: openai reported unavailable or expired account credits.',
		});
	});
});
