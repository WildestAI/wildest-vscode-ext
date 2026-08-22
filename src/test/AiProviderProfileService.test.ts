import * as assert from 'assert';
import { AiProviderProfileService } from '../services/AiProviderProfileService';

suite('AiProviderProfileService', () => {
	test('defaults to deterministic AI-off operation', () => {
		assert.deepStrictEqual(AiProviderProfileService.normalize(undefined), {
			provider: 'disabled', capabilities: [], authSource: 'none',
		});
	});

	test('normalizes a direct provider without accepting a key in settings', () => {
		const profile = AiProviderProfileService.normalize({
			provider: 'openai', model: 'gpt-4.1', capabilities: ['prose'], authSource: 'secret-storage',
		});
		assert.strictEqual(profile.baseUrl, 'https://api.openai.com/v1');
		assert.strictEqual(profile.model, 'gpt-4.1');
		assert.strictEqual(profile.authSource, 'secret-storage');
		assert.throws(() => AiProviderProfileService.normalize({
			provider: 'openai', apiKey: 'never-in-settings', capabilities: ['prose'], authSource: 'secret-storage',
		}), /Store API keys using SecretStorage/);
	});

	test('requires a base URL for OpenAI-compatible providers', () => {
		assert.throws(() => AiProviderProfileService.normalize({
			provider: 'openai-compatible', model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
		}), /needs a baseUrl/);
		const profile = AiProviderProfileService.normalize({
			provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', model: 'local-model',
			capabilities: ['prose'], authSource: 'secret-storage',
		});
		assert.strictEqual(profile.baseUrl, 'http://127.0.0.1:11434/v1');
	});

	test('reports disabled and missing-secret readiness without exposing secrets', async () => {
		const secrets = { get: async () => undefined } as any;
		const disabled = await AiProviderProfileService.readiness(AiProviderProfileService.normalize(undefined), secrets);
		assert.strictEqual(disabled.status, 'disabled');
		const missing = await AiProviderProfileService.readiness(AiProviderProfileService.normalize({
			provider: 'anthropic', capabilities: ['prose'], authSource: 'secret-storage',
		}), secrets);
		assert.strictEqual(missing.status, 'needs-configuration');
		assert.match(missing.detail, /SecretStorage/);
	});
});
