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

	test('requires a valid HTTP(S) base URL for OpenAI-compatible providers', () => {
		assert.throws(() => AiProviderProfileService.normalize({
			provider: 'openai-compatible', model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
		}), /needs a baseUrl/);
		for (const baseUrl of ['https://', 'https://.', 'ftp://localhost:11434/v1', 'not-a-url']) {
			assert.throws(() => AiProviderProfileService.normalize({
				provider: 'openai-compatible', baseUrl, model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
			}), /baseUrl must be an http\(s\) URL/);
		}
		for (const baseUrl of ['http://127.0.0.1:11434/v1', 'https://gateway.example.com/v1']) {
			const profile = AiProviderProfileService.normalize({
				provider: 'openai-compatible', baseUrl, model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
			});
			assert.strictEqual(profile.baseUrl, baseUrl);
		}
	});

	test('stores enabled-provider credentials before publishing profile configuration', async () => {
		const events: string[] = [];
		const secrets = { store: async () => { events.push('store'); } } as any;
		const configuration = { update: async () => { events.push('update'); } } as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'openai', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await AiProviderProfileService.saveProfile(profile, secrets, 'test-key', configuration);
		assert.deepStrictEqual(events, ['store', 'update']);
	});

	test('does not publish an enabled profile without a stored credential', async () => {
		let updated = false;
		const secrets = { store: async () => { throw new Error('SecretStorage unavailable'); } } as any;
		const configuration = { update: async () => { updated = true; } } as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'anthropic', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await assert.rejects(
			AiProviderProfileService.saveProfile(profile, secrets, 'test-key', configuration),
			/SecretStorage unavailable/,
		);
		assert.strictEqual(updated, false);
		await assert.rejects(
			AiProviderProfileService.saveProfile(profile, secrets, undefined, configuration),
			/API key is required/,
		);
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
