// Copyright (C) 2025  Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as vscode from 'vscode';
import { HistoryViewProvider } from '../providers/HistoryViewProvider';
import { CliService } from '../services/CliService';
import { GitHistoryCache } from '../services/GitHistoryCache';
import { GitService } from '../services/GitService';
import { GitCommit } from '../utils/types';

suite('HistoryViewProvider cache policy', () => {
	const repoRoot = '/tmp/wildest-history-cache-test';
	const commit: GitCommit = {
		hash: 'a'.repeat(40),
		shortHash: 'aaaaaaa',
		author: 'Nia',
		email: 'nia@example.com',
		date: new Date('2026-08-07T00:00:00Z'),
		message: 'test commit',
		subject: 'test commit',
		parents: [],
		refs: ['HEAD'],
	};

	let originalGetRepositories: typeof GitService.getRepositories;
	let originalSetupCommand: typeof CliService.setupCommand;
	let originalExecute: typeof CliService.execute;
	let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
	let messages: any[];
	let executeCalls: number;
	let provider: HistoryViewProvider;

	setup(() => {
		GitHistoryCache.invalidate(repoRoot);
		messages = [];
		executeCalls = 0;
		originalGetRepositories = GitService.getRepositories;
		originalSetupCommand = CliService.setupCommand;
		originalExecute = CliService.execute;
		originalShowWarningMessage = vscode.window.showWarningMessage;

		GitService.getRepositories = async () => [{ repoRoot, name: 'test' }] as any;
		CliService.setupCommand = () => ({ executable: 'wild', args: [], env: {} });
		CliService.execute = async () => {
			executeCalls++;
			return {
				stdout: `* ${commit.hash}|${commit.shortHash}|${commit.author}|${commit.email}|${commit.date.toISOString()}|${commit.subject}||HEAD\n`,
				stderr: '',
			};
		};

		provider = new HistoryViewProvider(
			vscode.Uri.file(process.cwd()),
			{ extensionPath: process.cwd() } as vscode.ExtensionContext,
			async () => undefined,
		);
		(provider as any)._view = {
			webview: {
				html: '',
				postMessage: (message: any) => { messages.push(message); return Promise.resolve(true); },
				asWebviewUri: (uri: vscode.Uri) => uri,
				cspSource: 'vscode-webview:',
			},
		};
	});

	teardown(() => {
		GitHistoryCache.invalidate(repoRoot);
		GitService.getRepositories = originalGetRepositories;
		CliService.setupCommand = originalSetupCommand;
		CliService.execute = originalExecute;
		vscode.window.showWarningMessage = originalShowWarningMessage;
	});

	test('uses warm history without executing the CLI on initial load', async () => {
		GitHistoryCache.update(repoRoot, [commit], ['* ']);

		await (provider as any).loadGitHistory(false);

		assert.strictEqual(executeCalls, 0);
		assert.strictEqual(messages.filter(message => message.type === 'commits').length, 1);
		assert.strictEqual(messages.find(message => message.type === 'commits').commits[0].hash, commit.hash);
	});

	test('fetches and caches history on a cold initial load', async () => {
		await (provider as any).loadGitHistory(false);

		assert.strictEqual(executeCalls, 1);
		assert.strictEqual(messages.filter(message => message.type === 'commits').length, 1);
		assert.strictEqual(GitHistoryCache.getCached(repoRoot)?.commits[0].hash, commit.hash);
	});

	test('explicit refresh bypasses a warm cache', async () => {
		GitHistoryCache.update(repoRoot, [commit], ['* ']);

		await (provider as any).loadGitHistory(true);

		assert.strictEqual(executeCalls, 1);
		assert.strictEqual(messages.filter(message => message.type === 'commits').length, 2);
	});

	test('failed refresh preserves cached history and reports a warning', async () => {
		GitHistoryCache.update(repoRoot, [commit], ['* ']);
		CliService.execute = async () => { throw new Error('failed'); };
		let warning = '';
		vscode.window.showWarningMessage = ((message: string) => {
			warning = message;
			return Promise.resolve(undefined);
		}) as typeof vscode.window.showWarningMessage;

		await (provider as any).loadGitHistory(true);

		assert.strictEqual(messages.some(message => message.type === 'error'), false);
		assert.match(warning, /Showing the last cached result/);
	});

	test('schedules another refresh when Git history times out', async () => {
		CliService.execute = async () => {
			executeCalls++;
			throw new Error('Timeout waiting for Git');
		};
		const originalSetTimeout = global.setTimeout;
		let scheduledDelay: number | undefined;
		global.setTimeout = ((callback: () => void, delay?: number) => {
			scheduledDelay = delay;
			return {} as NodeJS.Timeout;
		}) as typeof global.setTimeout;

		try {
			await provider.refresh(true);
		} finally {
			global.setTimeout = originalSetTimeout;
		}

		assert.strictEqual(executeCalls, 1);
		assert.strictEqual(scheduledDelay, 2000);
	});
});
