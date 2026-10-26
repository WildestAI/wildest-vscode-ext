import * as vscode from 'vscode';
import * as http from 'node:http';
import * as https from 'node:https';

export const AI_PROVIDER_IDS = ['disabled', 'openai', 'anthropic', 'openai-compatible'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];
export type AiAuthSource = 'none' | 'secret-storage';

export interface AiProviderProfile {
	provider: AiProviderId;
	baseUrl?: string;
	model?: string;
	capabilities: string[];
	authSource: AiAuthSource;
}

export interface AiProviderReadiness {
	status: 'disabled' | 'ready' | 'needs-configuration';
	detail: string;
}

export interface AiProviderPreflight {
	status: 'disabled' | 'needs-configuration' | 'ready' | 'credentials-rejected' | 'unsupported-model' | 'rate-limited' | 'provider-unavailable' | 'connection-failed';
	detail: string;
}

type ProviderRequest = (url: URL, headers: Record<string, string>) => Promise<number>;

const profileSetting = 'ai.providerProfile';
const secretPrefix = 'wildestai.ai.provider-key.';

const defaults: Record<AiProviderId, Omit<AiProviderProfile, 'provider'>> = {
	disabled: { capabilities: [], authSource: 'none' },
	openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', capabilities: ['prose'], authSource: 'secret-storage' },
	anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest', capabilities: ['prose'], authSource: 'secret-storage' },
	'openai-compatible': { capabilities: ['prose'], authSource: 'secret-storage' },
};

function isProvider(value: unknown): value is AiProviderId {
	return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Provider configuration deliberately contains no API key. Keys are held only in
 * VS Code SecretStorage and are never returned by this service or written to logs.
 */
export class AiProviderProfileService {
	public static normalize(value: unknown): AiProviderProfile {
		if (value === undefined || value === null) {
			return { provider: 'disabled', ...defaults.disabled };
		}
		if (typeof value !== 'object' || Array.isArray(value)) {
			throw new Error('WildestAI AI provider profile must be an object.');
		}

		const candidate = value as Record<string, unknown>;
		const allowedKeys = new Set(['provider', 'baseUrl', 'model', 'capabilities', 'authSource']);
		for (const key of Object.keys(candidate)) {
			if (!allowedKeys.has(key)) {
				throw new Error(`WildestAI AI provider profile does not support "${key}". Store API keys using SecretStorage, not settings.`);
			}
		}
		if (!isProvider(candidate.provider)) {
			throw new Error('WildestAI AI provider profile needs a supported provider.');
		}

		const provider = candidate.provider;
		const base = defaults[provider];
		const baseUrl = candidate.baseUrl ?? base.baseUrl;
		const model = candidate.model ?? base.model;
		const capabilities = candidate.capabilities ?? base.capabilities;
		const authSource = candidate.authSource ?? base.authSource;
		if (baseUrl !== undefined) {
			if (typeof baseUrl !== 'string') {
				throw new Error('WildestAI AI provider baseUrl must be an http(s) URL.');
			}
			try {
				const parsedBaseUrl = new URL(baseUrl);
				if (
					(parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:')
					|| !parsedBaseUrl.hostname
					|| parsedBaseUrl.hostname === '.'
					|| parsedBaseUrl.username
					|| parsedBaseUrl.password
					|| parsedBaseUrl.hash
					|| [...parsedBaseUrl.searchParams.keys()].some(key => /^(?:api[_-]?key|(?:access[_-]?)?token|secret|password|authorization|access[_-]?key)$/i.test(key))
				) {
					throw new Error('unsupported URL or credential-bearing parameter');
				}
			} catch {
				throw new Error('WildestAI AI provider baseUrl must be an http(s) URL.');
			}
		}
		if (model !== undefined && (typeof model !== 'string' || model.trim().length === 0)) {
			throw new Error('WildestAI AI provider model must be a non-empty string.');
		}
		if (!isStringArray(capabilities)) {
			throw new Error('WildestAI AI provider capabilities must be a list of non-empty strings.');
		}
		if (authSource !== 'none' && authSource !== 'secret-storage') {
			throw new Error('WildestAI AI provider authSource must be "none" or "secret-storage".');
		}
		if (provider === 'disabled' && authSource !== 'none') {
			throw new Error('The disabled AI provider must use authSource "none".');
		}
		if (provider !== 'disabled' && authSource !== 'secret-storage') {
			throw new Error('Enabled AI providers must use VS Code SecretStorage.');
		}
		if (provider === 'openai-compatible' && !baseUrl) {
			throw new Error('An OpenAI-compatible provider needs a baseUrl.');
		}
		return { provider, baseUrl, model, capabilities, authSource };
	}

	public static getProfile(configuration = vscode.workspace.getConfiguration('wildestai')): AiProviderProfile {
		return this.normalize(configuration.get<unknown>(profileSetting));
	}

	/**
	 * Use this only in recovery flows where an invalid user setting must not
	 * prevent the user from opening the provider picker and replacing it.
	 * Diagnostics continue to use getProfile so they can report invalid settings.
	 */
	public static getProfileOrDefault(configuration = vscode.workspace.getConfiguration('wildestai')): AiProviderProfile {
		try {
			return this.getProfile(configuration);
		} catch {
			return { provider: 'disabled', ...defaults.disabled };
		}
	}

	public static secretKey(provider: Exclude<AiProviderId, 'disabled'>): string {
		return `${secretPrefix}${provider}`;
	}

	public static async readiness(profile: AiProviderProfile, secrets: vscode.SecretStorage): Promise<AiProviderReadiness> {
		if (profile.provider === 'disabled') {
			return { status: 'disabled', detail: 'AI prose enrichment is disabled; deterministic Git and DiffGraph workflows remain available.' };
		}
		const key = await secrets.get(this.secretKey(profile.provider));
		if (!key) {
			return { status: 'needs-configuration', detail: `No API key is stored for ${profile.provider}. Use “Wildest AI: Configure AI Provider” to save one in VS Code SecretStorage.` };
		}
		return { status: 'ready', detail: `${profile.provider} is configured for optional prose enrichment. Keys are stored in VS Code SecretStorage.` };
	}

	/** Performs a user-invoked, metadata-only provider check without logging the key. */
	public static async preflight(
		profile: AiProviderProfile,
		secrets: vscode.SecretStorage,
		request: ProviderRequest = this.requestModel,
	): Promise<AiProviderPreflight> {
		if (profile.provider === 'disabled') {
			return { status: 'disabled', detail: 'AI prose enrichment is disabled. Deterministic Git and DiffGraph workflows remain available.' };
		}
		const key = await secrets.get(this.secretKey(profile.provider));
		if (!key || key.trim().length === 0) {
			return { status: 'needs-configuration', detail: `No API key is stored for ${profile.provider}. Configure the provider, then test it again.` };
		}

		const url = this.modelEndpoint(profile);
		const headers: Record<string, string> = profile.provider === 'anthropic'
			? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
			: { authorization: `Bearer ${key}` };
		try {
			const statusCode = await request(url, headers);
			if (statusCode >= 200 && statusCode < 300) {
				return { status: 'ready', detail: `${profile.provider} accepted the configured model for optional prose enrichment.` };
			}
			if (statusCode === 401 || statusCode === 403) {
				return { status: 'credentials-rejected', detail: `${profile.provider} rejected the configured credentials. Check the API key or account credits, then try again.` };
			}
			if (statusCode === 404) {
				return { status: 'unsupported-model', detail: `${profile.provider} could not find the configured model. Choose a model available to this account or endpoint.` };
			}
			if (statusCode === 429) {
				return { status: 'rate-limited', detail: `${profile.provider} is rate-limiting this request. Wait for capacity or select another configured provider.` };
			}
			if (statusCode >= 500) {
				return { status: 'provider-unavailable', detail: `${profile.provider} is currently unavailable. Deterministic Git and DiffGraph workflows remain available.` };
			}
			return { status: 'connection-failed', detail: `The ${profile.provider} preflight returned HTTP ${statusCode}. Check the endpoint configuration and try again.` };
		} catch {
			return { status: 'connection-failed', detail: `Could not connect to ${profile.provider}. Check the endpoint, network, and proxy settings, then try again.` };
		}
	}

	private static modelEndpoint(profile: AiProviderProfile): URL {
		const baseUrl = new URL(profile.baseUrl!);
		const basePath = baseUrl.pathname.replace(/\/+$/, '');
		baseUrl.pathname = profile.provider === 'anthropic'
			? `${basePath}/v1/models/${encodeURIComponent(profile.model!)}`
			: `${basePath}/models/${encodeURIComponent(profile.model!)}`;
		baseUrl.search = '';
		return baseUrl;
	}

	private static requestModel(url: URL, headers: Record<string, string>): Promise<number> {
		const client = url.protocol === 'https:' ? https : http;
		return new Promise((resolve, reject) => {
			const request = client.get(url, { headers, timeout: 8000 }, response => {
				response.resume();
				resolve(response.statusCode ?? 0);
			});
			request.once('timeout', () => request.destroy(new Error('Provider request timed out')));
			request.once('error', reject);
		});
	}

	public static async saveProfile(
		profile: AiProviderProfile,
		secrets: vscode.SecretStorage,
		apiKey?: string,
		configuration = vscode.workspace.getConfiguration('wildestai'),
	): Promise<void> {
		const normalized = this.normalize(profile);
		if (normalized.provider !== 'disabled') {
			if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
				throw new Error('An API key is required before enabling an AI provider.');
			}
			await secrets.store(this.secretKey(normalized.provider), apiKey);
		}
		await configuration.update(profileSetting, normalized, vscode.ConfigurationTarget.Global);
	}

	/**
	 * Disable optional AI prose enrichment and remove the active provider's key
	 * from VS Code SecretStorage. The caller must obtain explicit user consent
	 * because this deliberately makes that key unavailable for later reuse.
	 */
	public static async disableAndRemoveActiveKey(
		profile: AiProviderProfile,
		secrets: vscode.SecretStorage,
		configuration = vscode.workspace.getConfiguration('wildestai'),
	): Promise<void> {
		const normalized = this.normalize(profile);
		await configuration.update(profileSetting, { provider: 'disabled', ...defaults.disabled }, vscode.ConfigurationTarget.Global);
		if (normalized.provider !== 'disabled') {
			try {
				await secrets.delete(this.secretKey(normalized.provider));
			} catch (deletionError) {
				try {
					await configuration.update(profileSetting, normalized, vscode.ConfigurationTarget.Global);
				} catch (rollbackError) {
					const deletionDetail = deletionError instanceof Error ? deletionError.message : String(deletionError);
					const rollbackDetail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
					throw new Error(
						`Could not remove the ${normalized.provider} key: ${deletionDetail}. The provider profile could not be restored: ${rollbackDetail}. The key may still be stored; configure ${normalized.provider} again, then retry disabling AI.`,
					);
				}
				throw deletionError;
			}
		}
	}
}
