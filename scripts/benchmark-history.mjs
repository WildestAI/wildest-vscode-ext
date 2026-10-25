#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HISTORY_ARGS = ['log', '--graph', '-n', '50', '--pretty=format:%H|%h|%an|%ae|%ad|%s|%P|%D'];

function parseArguments(argv) {
	let commits = 100;
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--json') {
			json = true;
			continue;
		}
		if (argument === '--commits') {
			const value = Number(argv[index + 1]);
			if (!Number.isInteger(value) || value < 50 || value > 10000) {
				throw new Error('--commits must be an integer from 50 to 10000.');
			}
			commits = value;
			index += 1;
			continue;
		}
		if (argument === '--help') {
			console.log('Usage: node scripts/benchmark-history.mjs [--commits 100] [--json]');
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return { commits, json };
}

async function runGit(repository, args, environment = {}) {
	return execFileAsync('git', args, {
		cwd: repository,
		env: { ...process.env, ...environment },
		maxBuffer: 20 * 1024 * 1024,
	});
}

async function createFixture(commitCount) {
	const repository = await mkdtemp(join(tmpdir(), 'wildest-history-benchmark-'));
	await runGit(repository, ['init', '--quiet']);
	await runGit(repository, ['config', 'user.name', 'WildestAI benchmark']);
	await runGit(repository, ['config', 'user.email', 'benchmark@wildest.ai']);

	for (let index = 0; index < commitCount; index += 1) {
		await writeFile(join(repository, 'history-fixture.txt'), `fixture revision ${index}\n`);
		await runGit(repository, ['add', 'history-fixture.txt']);
		const timestamp = `2026-01-01T00:${String(index % 60).padStart(2, '0')}:00Z`;
		await runGit(repository, ['commit', '--quiet', '-m', `fixture revision ${index}`], {
			GIT_AUTHOR_DATE: timestamp,
			GIT_COMMITTER_DATE: timestamp,
		});
	}
	return repository;
}

async function timedHistoryRead(repository) {
	const startedAt = performance.now();
	const { stdout } = await runGit(repository, HISTORY_ARGS);
	return {
		elapsedMs: performance.now() - startedAt,
		commitsReturned: stdout.split('\n').filter(line => /[a-f0-9]{40}\|/.test(line)).length,
	};
}

async function gitVersion() {
	const { stdout } = await execFileAsync('git', ['--version']);
	return stdout.trim();
}

async function main() {
	const { commits, json } = parseArguments(process.argv.slice(2));
	const repository = await createFixture(commits);
	try {
		const cold = await timedHistoryRead(repository);
		const warm = await timedHistoryRead(repository);
		const result = {
			fixture: { commits, historyLimit: 50 },
			runtime: { node: process.version, platform: process.platform, arch: process.arch, git: await gitVersion() },
			measurements: {
				coldNativeGitHistoryMs: cold.elapsedMs,
				warmNativeGitHistoryMs: warm.elapsedMs,
				commitsReturned: warm.commitsReturned,
			},
			notes: [
				'Both samples run the exact native git log invocation used by HistoryViewProvider.',
				'The warm sample benefits only from the operating-system filesystem cache; it does not claim an extension in-memory cache or webview first-paint measurement.',
			],
		};
		if (json) {
			console.log(JSON.stringify(result));
		} else {
			console.log(JSON.stringify(result, null, 2));
		}
	} finally {
		await rm(repository, { recursive: true, force: true });
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
