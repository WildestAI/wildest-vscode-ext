import * as assert from 'assert';
import { AiProviderProfileService } from '../services/AiProviderProfileService';

suite('AiProviderProfileService', () => {
	test('defaults to deterministic AI-off operation', () => {
		assert.deepStrictEqual(AiProviderProfileService.normalize(undefined), {
			provider: 'disabled', capabilities: [], authSource: 'none',
		});
	});

	test('recovers a disabled profile for the configuration picker when saved settings are invalid', () => {
		const configuration = {
			get: () => ({ provider: 'openai', apiKey: 'never-in-settings' }),
		} as any;

		assert.throws(() => AiProviderProfileService.getProfile(configuration), /Store API keys using SecretStorage/);
		assert.deepStrictEqual(AiProviderProfileService.getProfileOrDefault(configuration), {
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
		for (const baseUrl of [
			'https://',
			'https://.',
			'ftp://localhost:11434/v1',
			'https://api-key@gateway.example.com/v1',
			'https://user:password@gateway.example.com/v1',
			'https://gateway.example.com/v1?api_key=never-in-settings',
			'https://gateway.example.com/v1?access-token=never-in-settings',
			'https://gateway.example.com/v1#never-in-settings',
			'not-a-url',
		]) {
			assert.throws(() => AiProviderProfileService.normalize({
				provider: 'openai-compatible', baseUrl, model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
			}), /baseUrl must be an http\(s\) URL/);
		}
		for (const baseUrl of [
			'http://127.0.0.1:11434/v1',
			'https://gateway.example.com/v1?api-version=2024-01-01',
			'https://gateway.example.com/v1?tokenizer=cl100k_base',
		]) {
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

	test('disables optional AI and removes only the active provider key', async () => {
		const events: string[] = [];
		const secrets = { delete: async (key: string) => { events.push(`delete:${key}`); } } as any;
		const configuration = { update: async (key: string, value: unknown) => { events.push(`update:${key}:${JSON.stringify(value)}`); } } as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', model: 'local-model', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await AiProviderProfileService.disableAndRemoveActiveKey(profile, secrets, configuration);

		assert.deepStrictEqual(events, [
			'update:ai.providerProfile:{"provider":"disabled","capabilities":[],"authSource":"none"}',
			'delete:wildestai.ai.provider-key.openai-compatible',
		]);
	});

	test('retains the active key when disabling cannot be persisted', async () => {
		let deleted = false;
		const secrets = { delete: async () => { deleted = true; } } as any;
		const configuration = { update: async () => { throw new Error('Settings write failed'); } } as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'openai', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await assert.rejects(
			AiProviderProfileService.disableAndRemoveActiveKey(profile, secrets, configuration),
			/Settings write failed/,
		);
		assert.strictEqual(deleted, false);
	});

	test('restores the active profile when credential removal fails', async () => {
		const events: string[] = [];
		const secrets = { delete: async () => { events.push('delete'); throw new Error('SecretStorage unavailable'); } } as any;
		const configuration = { update: async (key: string, value: unknown) => { events.push(`update:${key}:${JSON.stringify(value)}`); } } as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'openai', model: 'gpt-4.1', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await assert.rejects(
			AiProviderProfileService.disableAndRemoveActiveKey(profile, secrets, configuration),
			/SecretStorage unavailable/,
		);
		assert.deepStrictEqual(events, [
			'update:ai.providerProfile:{"provider":"disabled","capabilities":[],"authSource":"none"}',
			'delete',
			'update:ai.providerProfile:{"provider":"openai","baseUrl":"https://api.openai.com/v1","model":"gpt-4.1","capabilities":["prose"],"authSource":"secret-storage"}',
		]);
	});

	test('preserves deletion failure and recovery guidance when profile restoration also fails', async () => {
		const secrets = { delete: async () => { throw new Error('SecretStorage unavailable'); } } as any;
		const configuration = {
			update: async (_key: string, value: { provider: string }) => {
				if (value.provider === 'openai') {
					throw new Error('Settings write unavailable');
				}
			},
		} as any;
		const profile = AiProviderProfileService.normalize({
			provider: 'openai', model: 'gpt-4.1', capabilities: ['prose'], authSource: 'secret-storage',
		});

		await assert.rejects(
			AiProviderProfileService.disableAndRemoveActiveKey(profile, secrets, configuration),
			/Could not remove the openai key: SecretStorage unavailable\. The provider profile could not be restored: Settings write unavailable\. The key may still be stored; configure openai again, then retry disabling AI\./,
		);
	});

	test('disabling an already-disabled profile does not delete any credential', async () => {
		const events: string[] = [];
		const secrets = { delete: async () => { events.push('delete'); } } as any;
		const configuration = { update: async () => { events.push('update'); } } as any;

		await AiProviderProfileService.disableAndRemoveActiveKey(
			AiProviderProfileService.normalize(undefined), secrets, configuration,
		);

		assert.deepStrictEqual(events, ['update']);
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
