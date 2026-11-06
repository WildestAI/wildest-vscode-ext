#!/usr/bin/env node
// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sync the wild CLI's DiffGraph schema and canonical example into the
 * extension, and record exactly which CLI revision they came from.
 *
 * Usage:
 *   node scripts/release/sync-cli-contract.mjs <cli-release-tag-or-commit>   # via `gh api`
 *   node scripts/release/sync-cli-contract.mjs --from-dir <wild checkout> [--ref <label>]
 *
 * The release handoff runs the first form for every new CLI release, so the
 * extension's validator always follows the CLI's own published contract.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'WildestAI/wild';
const SCHEMA_PATH = 'diffgraph/schema/diffgraph-v2.schema.json';
const EXAMPLE_PATH = 'diffgraph/schema/diffgraph-v2.structural.example.json';

export const contractFiles = {
	schema: 'src/contract/diffgraph-v2.schema.json',
	example: 'src/test/fixtures/diffgraph-v2.structural.example.json',
	source: 'src/contract/cli-contract-source.json',
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function parseJsonDocument(text, label) {
	try {
		const value = JSON.parse(text);
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw new Error('not a JSON object');
		}
		return value;
	} catch (error) {
		throw new Error(`${label} is not a valid JSON object: ${error.message}`);
	}
}

/** Write the synced contract into ``root`` and return the source record. */
export function writeContract(root, { schemaText, exampleText, ref }) {
	const schema = parseJsonDocument(schemaText, 'CLI schema');
	if (typeof schema.$schema !== 'string' || typeof schema.properties !== 'object') {
		throw new Error('CLI schema does not look like a JSON Schema document');
	}
	const example = parseJsonDocument(exampleText, 'CLI example');
	if (!/^2\.\d+$/.test(String(example.schema_version))) {
		throw new Error(`CLI example has unsupported schema_version ${JSON.stringify(example.schema_version)}`);
	}
	const source = {
		repository: REPOSITORY,
		ref,
		note: 'Synced from the wild CLI by scripts/release/sync-cli-contract.mjs; the release handoff refreshes it from each CLI release tag.',
		schemaPath: SCHEMA_PATH,
		schemaSha256: sha256(schemaText),
		examplePath: EXAMPLE_PATH,
		exampleSha256: sha256(exampleText),
	};
	for (const file of Object.values(contractFiles)) {
		fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
	}
	fs.writeFileSync(path.join(root, contractFiles.schema), schemaText);
	fs.writeFileSync(path.join(root, contractFiles.example), exampleText);
	fs.writeFileSync(path.join(root, contractFiles.source), `${JSON.stringify(source, null, 2)}\n`);
	return source;
}

function fetchFromGitHub(ref, file) {
	return execFileSync(
		'gh',
		['api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPOSITORY}/contents/${file}?ref=${encodeURIComponent(ref)}`],
		{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
}

function main(argv) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
	let input;
	if (argv[0] === '--from-dir') {
		const dir = argv[1];
		if (!dir) {
			throw new Error('--from-dir needs a path to a wild checkout');
		}
		const refIndex = argv.indexOf('--ref');
		const ref = refIndex >= 0 ? argv[refIndex + 1] : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		input = {
			schemaText: fs.readFileSync(path.join(dir, SCHEMA_PATH), 'utf8'),
			exampleText: fs.readFileSync(path.join(dir, EXAMPLE_PATH), 'utf8'),
			ref,
		};
	} else if (argv[0]) {
		const ref = argv[0];
		input = { schemaText: fetchFromGitHub(ref, SCHEMA_PATH), exampleText: fetchFromGitHub(ref, EXAMPLE_PATH), ref };
	} else {
		throw new Error('pass a CLI release tag or commit, or --from-dir <wild checkout>');
	}
	const source = writeContract(root, input);
	console.log(`Synced the DiffGraph contract from ${source.repository}@${source.ref} (schema ${source.schemaSha256.slice(0, 12)}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
