// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contractFiles, writeContract } from './sync-cli-contract.mjs';

const schemaText = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', properties: {} });
const exampleText = JSON.stringify({ schema_version: '2.1' });

test('writes the schema, example, and an exact source record', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-sync-'));
	const source = writeContract(root, { schemaText, exampleText, ref: 'cli-v1.3.0-0123456789ab' });

	assert.equal(fs.readFileSync(path.join(root, contractFiles.schema), 'utf8'), schemaText);
	assert.equal(fs.readFileSync(path.join(root, contractFiles.example), 'utf8'), exampleText);
	const recorded = JSON.parse(fs.readFileSync(path.join(root, contractFiles.source), 'utf8'));
	assert.deepEqual(recorded, source);
	assert.equal(recorded.ref, 'cli-v1.3.0-0123456789ab');
	assert.equal(recorded.schemaSha256, createHash('sha256').update(schemaText).digest('hex'));
	assert.equal(recorded.exampleSha256, createHash('sha256').update(exampleText).digest('hex'));
});

test('refuses documents that are not a schema or a v2 example', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-sync-'));
	assert.throws(() => writeContract(root, { schemaText: '[]', exampleText, ref: 'x' }), /CLI schema is not a valid JSON object/);
	assert.throws(() => writeContract(root, { schemaText: '{}', exampleText, ref: 'x' }), /does not look like a JSON Schema/);
	assert.throws(
		() => writeContract(root, { schemaText, exampleText: JSON.stringify({ schema_version: '3.0' }), ref: 'x' }),
		/unsupported schema_version "3.0"/,
	);
	assert.equal(fs.existsSync(path.join(root, contractFiles.source)), false);
});

test('the committed contract matches its recorded source hashes', () => {
	const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
	const source = JSON.parse(fs.readFileSync(path.join(root, contractFiles.source), 'utf8'));
	const hash = (file) => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
	assert.equal(hash(contractFiles.schema), source.schemaSha256);
	assert.equal(hash(contractFiles.example), source.exampleSha256);
});
