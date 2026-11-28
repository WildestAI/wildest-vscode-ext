// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as vscode from 'vscode';
import { DiffGraphExplorerProvider } from './providers/DiffGraphExplorerProvider';
import { DiffGraphViewProvider } from './providers/DiffGraphViewProvider';
import { HistoryViewProvider } from './providers/HistoryViewProvider';
import { DiffService } from './services/DiffService';
import { GitService } from './services/GitService';
import { CliService } from './services/CliService';
import { AiProviderId, AiProviderProfile, AiProviderProfileService } from './services/AiProviderProfileService';
import { formatRuntimeDiagnosticsReport } from './utils/runtimeDiagnosticsReport';
import { redactDiagnostics } from './utils/redactDiagnostics';
import { presentRuntimeHealth } from './utils/runtimeHealthPresentation';
import { presentRuntimeHealthFailure } from './utils/runtimeHealthFailurePresentation';
import { getRuntimeHealthRemediation } from './utils/runtimeHealthRemediation';
import { createRuntimeHealthRefreshGate } from './utils/runtimeHealthRefresh';
import { presentRuntimeHealthRecheck } from './utils/runtimeHealthRecheckPresentation';
import { presentProviderPreflight } from './utils/providerPreflightPresentation';
import {
	evaluateCachedGraphFirstPaintBudget,
	evaluateCancellationAcknowledgementBudget,
	evaluateWarmHistoryBudget,
} from './utils/historyPerformanceBudget';
import { evaluateStructuralDiffBudget } from './utils/diffGraphPerformanceBudget';

async function buildRuntimeDiagnosticsReport(context: vscode.ExtensionContext): Promise<{
	report: string;
	diagnostics: ReturnType<typeof CliService.inspectRuntime>;
	probe: Awaited<ReturnType<typeof CliService.probeRuntime>>;
	cliStatus: string;
	cliDetail: string;
	providerReadiness: 'disabled' | 'ready' | 'needs-configuration';
}> {
	const diagnostics = CliService.inspectRuntime(context);
	const probe = await CliService.probeRuntime(diagnostics);
	let provider = 'disabled';
	let providerModel: string | undefined;
	let providerReadiness: 'disabled' | 'ready' | 'needs-configuration' = 'needs-configuration';
	let providerDetail = 'Invalid provider configuration.';

	try {
		const providerProfile = AiProviderProfileService.getProfile();
		const readiness = await AiProviderProfileService.readiness(providerProfile, context.secrets);
		provider = providerProfile.provider;
		providerModel = providerProfile.model;
		providerReadiness = readiness.status;
		providerDetail = readiness.detail;
	} catch (error) {
		providerDetail = error instanceof Error ? error.message : providerDetail;
	}

	return {
		diagnostics,
		probe,
		report: formatRuntimeDiagnosticsReport({
			extensionVersion: context.extension.packageJSON.version || 'unknown',
			diagnostics,
			probe,
			provider,
			providerModel,
			providerReadiness,
			providerDetail,
		}),
		cliStatus: diagnostics.status,
		cliDetail: redactDiagnostics(diagnostics.detail),
		providerReadiness,
	};
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Keep the old provider for backwards compatibility with generate command
	const diffGraphWebViewProvider = new DiffGraphViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.diffGraphView', diffGraphWebViewProvider)
	);

	// Register services with provider reference
	const diffService = new DiffService(context, diffGraphWebViewProvider);

	// Register the Changes webview provider
	const changesProvider = new DiffGraphExplorerProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('wildestai.changesView', changesProvider)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('wildestai.changesViewInSCM', changesProvider)
	);

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.refreshChangesView', () => {
		changesProvider.updateRepositories();
	}));

	// Register the History webview provider with commit click callback
	const historyProvider = new HistoryViewProvider(
		context.extensionUri,
		context,
		async (commitHash: string, repoPath: string) => {
			await diffService.openCommitDiff(context, commitHash, repoPath);
		}
	);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('wildestai.historyView', historyProvider)
	);
	context.subscriptions.push(historyProvider);

	// Register history refresh command
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.refreshHistory', async () => {
		await historyProvider.refresh();
	}));

	const historyPerformanceOutput = vscode.window.createOutputChannel('WildestAI Performance');
	context.subscriptions.push(historyPerformanceOutput);
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.showDiffGraphPerformanceDiagnostics', () => {
		const timing = diffService.getLastPerformanceSnapshot();
		const structuralDiffBudget = evaluateStructuralDiffBudget(timing.structuralDiffMs);
		const structuralDiffResult = structuralDiffBudget.status === 'not-measured'
			? 'not measured (generate a staged or unstaged DiffGraph first)'
			: `${structuralDiffBudget.status} (${structuralDiffBudget.measuredMs!.toFixed(1)} ms)`;
		historyPerformanceOutput.clear();
		historyPerformanceOutput.appendLine('WildestAI local DiffGraph performance');
		historyPerformanceOutput.appendLine(`Source: ${timing.source}`);
		historyPerformanceOutput.appendLine(`Structural diff budget (<${structuralDiffBudget.budgetMs} ms): ${structuralDiffResult}`);
		historyPerformanceOutput.appendLine('The sample measures CLI generation and webview handoff; it excludes cache lookup and end-to-end command latency.');
		historyPerformanceOutput.appendLine('This report stays local and contains no repository paths, commits, or telemetry.');
		historyPerformanceOutput.show(true);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.showHistoryPerformanceDiagnostics', () => {
		const timing = historyProvider.getLastPerformanceSnapshot();
		historyPerformanceOutput.clear();
		historyPerformanceOutput.appendLine('WildestAI local history performance');
		historyPerformanceOutput.appendLine(`Source: ${timing.source}`);
		historyPerformanceOutput.appendLine(`Repository discovery: ${timing.repositoryDiscoveryMs.toFixed(1)} ms`);
		historyPerformanceOutput.appendLine(`Cache lookup: ${timing.cacheLookupMs.toFixed(1)} ms`);
		historyPerformanceOutput.appendLine(`Git fetch: ${timing.gitFetchMs === undefined ? 'not run' : `${timing.gitFetchMs.toFixed(1)} ms`}`);
		historyPerformanceOutput.appendLine(`Graph build: ${timing.graphBuildMs.toFixed(1)} ms`);
		historyPerformanceOutput.appendLine(`First usable graph: ${timing.firstUsableGraphMs === undefined ? 'not shown' : `${timing.firstUsableGraphMs.toFixed(1)} ms`}`);
		historyPerformanceOutput.appendLine(`Total: ${timing.totalMs.toFixed(1)} ms`);
		const warmHistoryBudget = evaluateWarmHistoryBudget(timing);
		const warmHistoryResult = warmHistoryBudget.status === 'not-measured'
			? 'not measured (last load was not cache-backed)'
			: `${warmHistoryBudget.status} (${warmHistoryBudget.measuredMs!.toFixed(1)} ms)`;
		historyPerformanceOutput.appendLine(`Warm history budget (<${warmHistoryBudget.budgetMs} ms): ${warmHistoryResult}`);
		const cachedGraphFirstPaintBudget = evaluateCachedGraphFirstPaintBudget(timing);
		const cachedGraphFirstPaintResult = cachedGraphFirstPaintBudget.status === 'not-measured'
			? 'not measured (no cached graph was shown)'
			: `${cachedGraphFirstPaintBudget.status} (${cachedGraphFirstPaintBudget.measuredMs!.toFixed(1)} ms)`;
		historyPerformanceOutput.appendLine(`Cached graph first-paint budget (<${cachedGraphFirstPaintBudget.budgetMs} ms): ${cachedGraphFirstPaintResult}`);
		const cancellationBudget = evaluateCancellationAcknowledgementBudget(timing);
		const cancellationResult = cancellationBudget.status === 'not-measured'
			? 'not measured (no refresh cancellation acknowledged)'
			: `${cancellationBudget.status} (${cancellationBudget.measuredMs!.toFixed(1)} ms)`;
		historyPerformanceOutput.appendLine(`Cancellation acknowledgement budget (<${cancellationBudget.budgetMs} ms): ${cancellationResult}`);
		historyPerformanceOutput.appendLine('This report stays local and contains no repository paths, commits, or telemetry.');
		historyPerformanceOutput.show(true);
	}));

	// Register the hello world command
	const helloDisposable = vscode.commands.registerCommand('wildestai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Wildest AI!');
	});
	context.subscriptions.push(helloDisposable);

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.disableAiProviderAndRemoveKey', async () => {
		const profile = AiProviderProfileService.getProfileOrDefault();
		if (profile.provider === 'disabled') {
			void vscode.window.showInformationMessage('WildestAI optional AI prose is already disabled.');
			return;
		}
		const removesConfiguredKey = profile.authSource === 'secret-storage';
		const confirmationLabel = removesConfiguredKey ? 'Disable and Remove Key' : 'Disable AI Prose';
		const confirmation = await vscode.window.showWarningMessage(
			removesConfiguredKey
				? `Disable optional AI prose and remove the ${profile.provider} API key from VS Code SecretStorage? This cannot be undone.`
				: `Disable optional AI prose and remove any previously stored ${profile.provider} API key from VS Code SecretStorage? This cannot be undone.`,
			{ modal: true },
			confirmationLabel,
		);
		if (confirmation !== confirmationLabel) { return; }
		try {
			await AiProviderProfileService.disableAndRemoveActiveKey(profile, context.secrets);
			void vscode.window.showInformationMessage(removesConfiguredKey
				? 'WildestAI optional AI prose is disabled and the active provider key was removed. Deterministic workflows remain available.'
				: 'WildestAI optional AI prose is disabled and any previously stored active provider key was removed. Deterministic workflows remain available.');
		} catch (error) {
			void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to disable the AI provider and remove its key.');
			return;
		}
		await refreshRuntimeHealthStatus();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.testAiProvider', async () => {
		const profile = AiProviderProfileService.getProfileOrDefault();
		const result = await AiProviderProfileService.preflight(profile, context.secrets);
		if (result.status === 'ready' || result.status === 'disabled') {
			void vscode.window.showInformationMessage(result.detail);
			return;
		}
		void vscode.window.showWarningMessage(result.detail);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('wildestai.configureAiProvider', async () => {
		const providerPick = await vscode.window.showQuickPick([
			{ label: 'disabled' as AiProviderId, description: 'Keep deterministic Git and DiffGraph workflows AI-free' },
			{ label: 'openai' as AiProviderId, description: 'Direct OpenAI API for optional prose enrichment' },
			{ label: 'anthropic' as AiProviderId, description: 'Direct Anthropic API for optional prose enrichment' },
			{ label: 'openai-compatible' as AiProviderId, description: 'A compatible gateway or local model endpoint' },
		], { placeHolder: 'Choose an optional AI prose provider' });
		if (!providerPick) { return; }
		const provider = providerPick.label;

		let profile: AiProviderProfile;
		try {
			const current = AiProviderProfileService.getProfileOrDefault();
			const baseUrl = provider === 'openai-compatible'
				? await vscode.window.showInputBox({ prompt: 'OpenAI-compatible base URL', value: current.provider === provider ? current.baseUrl : undefined, ignoreFocusOut: true })
				: undefined;
			if (provider === 'openai-compatible' && !baseUrl) { return; }
			const model = provider === 'disabled' ? undefined : await vscode.window.showInputBox({
				prompt: 'Model name', value: current.provider === provider ? current.model : undefined, ignoreFocusOut: true,
			});
			if (provider !== 'disabled' && !model) { return; }
			let credentialFreeLocal = false;
			if (provider === 'openai-compatible') {
				try {
					const parsedBaseUrl = new URL(baseUrl!);
					credentialFreeLocal = (parsedBaseUrl.protocol === 'http:' || parsedBaseUrl.protocol === 'https:')
						&& (parsedBaseUrl.hostname === 'localhost' || parsedBaseUrl.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(parsedBaseUrl.hostname));
				} catch {
					// normalize() reports malformed URLs after the setup flow completes.
				}
			}
			const authChoice = credentialFreeLocal ? await vscode.window.showQuickPick([
				{ label: 'No API key', description: 'Credential-free local endpoint' },
				{ label: 'Use API key', description: 'Store a local gateway key in VS Code SecretStorage' },
			], { placeHolder: 'Does this local endpoint require an API key?' }) : undefined;
			if (credentialFreeLocal && !authChoice) { return; }
			profile = AiProviderProfileService.normalize({
				provider, baseUrl, model, capabilities: provider === 'disabled' ? [] : ['prose'],
				authSource: provider === 'disabled' ? 'none' : authChoice?.label === 'No API key' ? 'none' : 'secret-storage',
			});
		} catch (error) {
			void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to configure the AI provider.');
			return;
		}

		const apiKey = profile.authSource === 'secret-storage' ? await vscode.window.showInputBox({
			prompt: `API key for ${provider} (stored only in VS Code SecretStorage)`, password: true, ignoreFocusOut: true,
		}) : undefined;
		if (profile.authSource === 'secret-storage' && !apiKey) { return; }
		try {
			await AiProviderProfileService.saveProfile(profile, context.secrets, apiKey);
		} catch (error) {
			void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Unable to save the AI provider configuration.');
			return;
		}
		await refreshRuntimeHealthStatus();
		// Bind this automatic check to the credential entered by this setup run.
		const preflight = await AiProviderProfileService.preflight(profile, context.secrets, undefined, apiKey);
		const presentation = presentProviderPreflight(profile, preflight);
		if (presentation.severity === 'info') {
			void vscode.window.showInformationMessage(presentation.message);
		} else {
			void vscode.window.showWarningMessage(presentation.message);
		}
	}));

	const runtimeDiagnosticsOutput = vscode.window.createOutputChannel('WildestAI Diagnostics');
	context.subscriptions.push(runtimeDiagnosticsOutput);
	const runtimeHealthStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	runtimeHealthStatus.command = 'wildestai.showRuntimeDiagnostics';
	runtimeHealthStatus.text = '$(sync~spin) WildestAI CLI: checking';
	runtimeHealthStatus.tooltip = 'Checking WildestAI runtime health…';
	runtimeHealthStatus.show();
	context.subscriptions.push(runtimeHealthStatus);
	const runtimeHealthRefreshGate = createRuntimeHealthRefreshGate();
	const refreshRuntimeHealthStatus = async (refreshDiagnosticsOutput = false) => {
		const isCurrentRefresh = runtimeHealthRefreshGate.start();
		let runtimeReport: Awaited<ReturnType<typeof buildRuntimeDiagnosticsReport>>;
		try {
			runtimeReport = await buildRuntimeDiagnosticsReport(context);
		} catch (error) {
			if (!isCurrentRefresh()) {
				return { kind: 'superseded' } as const;
			}
			const failure = presentRuntimeHealthFailure(error);
			runtimeHealthStatus.text = failure.text;
			runtimeHealthStatus.tooltip = failure.tooltip;
			if (refreshDiagnosticsOutput) {
				runtimeDiagnosticsOutput.clear();
				runtimeDiagnosticsOutput.appendLine(failure.diagnostics);
			}
			return { kind: 'failed' } as const;
		}
		if (!isCurrentRefresh()) {
			return { kind: 'superseded' } as const;
		}
		runtimeHealthStatus.text = presentRuntimeHealth(
			runtimeReport.diagnostics,
			runtimeReport.probe,
			runtimeReport.providerReadiness,
		).text;
		runtimeHealthStatus.tooltip = runtimeReport.report;
		if (refreshDiagnosticsOutput) {
			runtimeDiagnosticsOutput.clear();
			runtimeDiagnosticsOutput.appendLine(runtimeReport.report);
		}
		return { kind: 'report', report: runtimeReport } as const;
	};
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('wildestai.ai.providerProfile')) {
			void refreshRuntimeHealthStatus();
		}
	}));
	void refreshRuntimeHealthStatus();
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.showRuntimeDiagnostics', async () => {
		let runtimeReport: Awaited<ReturnType<typeof buildRuntimeDiagnosticsReport>>;
		try {
			runtimeReport = await buildRuntimeDiagnosticsReport(context);
		} catch (error) {
			const failure = presentRuntimeHealthFailure(error);
			runtimeDiagnosticsOutput.clear();
			runtimeDiagnosticsOutput.appendLine(failure.diagnostics);
			runtimeDiagnosticsOutput.show(true);
			return;
		}
		runtimeDiagnosticsOutput.clear();
		runtimeDiagnosticsOutput.appendLine(runtimeReport.report);
		runtimeDiagnosticsOutput.show(true);

		const remediation = getRuntimeHealthRemediation(runtimeReport.diagnostics, runtimeReport.probe);
		if (remediation) {
			const actions = [
				...(remediation.canRestorePackagedExecutePermission ? ['Restore Execute Permission'] : []),
				'Recheck Runtime Health',
				'Open Install Help',
				'Copy Diagnostics',
			];
			const action = await vscode.window.showWarningMessage(
				`WildestAI CLI ${remediation.status}: ${redactDiagnostics(remediation.detail)}`,
				...actions,
			);
			if (action === 'Restore Execute Permission') {
				const restored = CliService.restorePackagedExecutablePermission(runtimeReport.diagnostics);
				void vscode.window.showInformationMessage(restored
					? 'WildestAI restored execute permission on the verified packaged CLI.'
					: 'WildestAI could not safely restore execute permission. Reinstall the extension from a trusted source.');
				await vscode.commands.executeCommand('wildestai.recheckRuntimeHealth');
			} else if (action === 'Recheck Runtime Health') {
				await vscode.commands.executeCommand('wildestai.recheckRuntimeHealth');
			} else if (action === 'Open Install Help') {
				await vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=WildestAI.wildest-vscode-ext'));
			} else if (action === 'Copy Diagnostics') {
				await vscode.commands.executeCommand('wildestai.copyRuntimeDiagnostics');
			}
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.recheckRuntimeHealth', async () => {
		const refresh = await refreshRuntimeHealthStatus(true);
		if (refresh.kind === 'superseded') {
			return;
		}
		if (refresh.kind === 'failed') {
			void vscode.window.showWarningMessage('WildestAI could not complete the runtime health check. Open Runtime Diagnostics for redacted details.');
			return;
		}
		const runtimeReport = refresh.report;
		const presentation = presentRuntimeHealthRecheck(
			runtimeReport.diagnostics,
			runtimeReport.probe,
			runtimeReport.providerReadiness,
		);
		if (presentation.severity === 'warning') {
			void vscode.window.showWarningMessage(redactDiagnostics(presentation.message));
		} else {
			void vscode.window.showInformationMessage(presentation.message);
		}
		return runtimeReport;
	}));
	context.subscriptions.push(vscode.commands.registerCommand('wildestai.copyRuntimeDiagnostics', async () => {
		const runtimeReport = await buildRuntimeDiagnosticsReport(context);
		await vscode.env.clipboard.writeText(runtimeReport.report);
		void vscode.window.showInformationMessage('Sanitized WildestAI runtime diagnostics copied to the clipboard.');
	}));

	// Register legacy commands for backwards compatibility
	const openChangesDisposable = vscode.commands.registerCommand('wildestai.openChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.openChanges(context, repoPath);
		}
	});
	context.subscriptions.push(openChangesDisposable);

	const openStagedChangesDisposable = vscode.commands.registerCommand('wildestai.openStagedChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.openStagedChanges(context, repoPath);
		}
	});
	context.subscriptions.push(openStagedChangesDisposable);

	const refreshChangesDisposable = vscode.commands.registerCommand('wildestai.refreshChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.refreshChanges(context, repoPath);
		}
	});
	context.subscriptions.push(refreshChangesDisposable);

	const refreshStagedChangesDisposable = vscode.commands.registerCommand('wildestai.refreshStagedChanges', async (treeItemOrRepoPath?: any) => {
		const repoPath = await GitService.getRepositoryPath(treeItemOrRepoPath);
		if (repoPath) {
			await diffService.refreshStagedChanges(context, repoPath);
		}
	});
	context.subscriptions.push(refreshStagedChangesDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
