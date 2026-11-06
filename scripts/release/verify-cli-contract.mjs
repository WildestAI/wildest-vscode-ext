#!/usr/bin/env node
// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Run a real `wild` binary exactly the way the extension does and validate
 * every JSON artifact with the extension's own runtime validator.
 *
 * Usage: npm run verify:cli-contract -- <path-to-wild-binary>
 *
 * Release workflows run this against the downloaded CLI release, so a CLI
 * whose output the extension would reject never reaches a release PR or the
 * Marketplace. Requires `npm run compile-tests` (the npm script does that).
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(root, 'out/utils/diffGraphV2.js');

function fail(message) {
	console.error(`CLI contract check failed: ${message}`);
	process.exit(1);
}

const binaryArgument = process.argv[2];
if (!binaryArgument) {
	fail('pass the path to a wild binary');
}
const binary = path.resolve(binaryArgument);
if (!fs.existsSync(binary)) {
	fail(`no wild binary at ${binary}`);
}
if (!fs.existsSync(validatorPath)) {
	fail(`compiled validator missing at ${validatorPath}; run npm run compile-tests`);
}
const { validateDiffGraphArtifact } = require(validatorPath);

// The binary under test is untrusted input: it gets a minimal environment, so
// no credential in this process (e.g. GH_TOKEN in CI) can reach it, a
// throwaway HOME, and Git independent of user/system configuration.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wild-contract-home-'));
const passthrough = ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'PATHEXT', 'COMSPEC'];
const env = {
	...Object.fromEntries(passthrough.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])),
	HOME: home,
	USERPROFILE: home,
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_NOSYSTEM: '1',
	GIT_AUTHOR_NAME: 'Contract Check',
	GIT_AUTHOR_EMAIL: 'contract@example.invalid',
	GIT_COMMITTER_NAME: 'Contract Check',
	GIT_COMMITTER_EMAIL: 'contract@example.invalid',
};
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wild-contract-'));
const outputs = fs.mkdtempSync(path.join(os.tmpdir(), 'wild-contract-out-'));
const git = (...args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();

/** Run the CLI; on failure, report its exit status and stderr as readable text. */
function runCli(label, args) {
	try {
		return execFileSync(binary, args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (error) {
		const stderr = String(error.stderr ?? '').trim().split('\n').slice(-5).join('\n');
		const status = error.status ?? error.signal ?? error.code;
		fail(`${label}: \`wild ${args.join(' ')}\` exited with ${status}${stderr ? `:\n${stderr}` : ''}`);
	}
}
const write = (file, text) => {
	fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
	fs.writeFileSync(path.join(repo, file), text);
};

try {
	git('init', '-q');
	write('pkg/__init__.py', '');
	write('pkg/lib.py', 'class Base:\n    pass\n\ndef f(a):\n    return a\n');
	write('pkg/use.py', 'from pkg.lib import Base, f\n\nclass Child(Base):\n    def run(self):\n        return f(1)\n');
	write('README.md', '# Contract check\n');
	git('add', '.');
	git('commit', '-q', '-m', 'base');
	write('pkg/lib.py', 'class Base:\n    x = 1\n\ndef f(a, b=0):\n    return a + b\n');
	git('commit', '-q', '-am', 'change signature');
	const commit = git('rev-parse', 'HEAD');
	// Leave both a staged and an unstaged change for the working-tree views.
	write('README.md', '# Contract check\n\nStaged.\n');
	git('add', 'README.md');
	write('pkg/use.py', 'from pkg.lib import Base, f\n\nclass Child(Base):\n    def run(self):\n        return f(2)\n');

	const version = runCli('version', ['--version']).trim();
	console.log(`Checking ${version} (${binary})`);

	// The same argument shapes as src/services/DiffService.ts.
	const jsonRuns = {
		unstaged: ['diff', '--format', 'json'],
		staged: ['diff', '--format', 'json', '--staged'],
		commit: ['diff', `${commit}~1..${commit}`, '--format', 'json'],
	};
	for (const [name, args] of Object.entries(jsonRuns)) {
		const output = path.join(outputs, `${name}.json`);
		runCli(name, [...args, '--output', output]);
		let artifact;
		try {
			artifact = JSON.parse(fs.readFileSync(output, 'utf8'));
		} catch (error) {
			fail(`${name}: output is not JSON (${error.message})`);
		}
		try {
			validateDiffGraphArtifact(artifact);
		} catch (error) {
			fail(`${name}: ${error.message}`);
		}
		if (!artifact.files.length) {
			fail(`${name}: expected at least one changed file`);
		}
		console.log(`  ✔ ${name}: schema ${artifact.schema_version}, ${artifact.files.length} files, ${artifact.symbols.length} symbols, ${artifact.relationships.length} relationships`);
	}

	// The default renderer loads the CLI's own HTML report into the webview.
	const html = path.join(outputs, 'report.html');
	runCli('html', ['diff', '--format', 'html', '--output', html, '--no-open']);
	const report = fs.readFileSync(html, 'utf8');
	if (!/^<!doctype html>/i.test(report) || !report.includes('Content-Security-Policy') || !report.includes('id="diffgraph-artifact"')) {
		fail('html: the report is not a self-contained DiffGraph HTML document');
	}
	console.log(`  ✔ html: ${report.length} bytes, self-contained with a CSP`);
	console.log('CLI output satisfies the extension contract.');
} finally {
	fs.rmSync(repo, { recursive: true, force: true });
	fs.rmSync(outputs, { recursive: true, force: true });
	fs.rmSync(home, { recursive: true, force: true });
}
