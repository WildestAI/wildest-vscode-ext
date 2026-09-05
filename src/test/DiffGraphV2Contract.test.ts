// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
	DiffGraphContractError,
	parseDiffGraphArtifact,
	validateDiffGraphArtifact,
} from '../utils/diffGraphV2';

suite('DiffGraph v2 contract', () => {
	const fixturePath = path.resolve(__dirname, '../../src/test/fixtures/diffgraph-v2.structural.example.json');
	const fixtureText = fs.readFileSync(fixturePath, 'utf8');
	const fixtureHash = '580a35c321ed7ae7be8ce6605f6aafb21f00a512b028d1f91495e83f566f35fd';

	function fixtureValue(): Record<string, unknown> {
		return JSON.parse(fixtureText) as Record<string, unknown>;
	}

	test('vendors the exact canonical CLI fixture and accepts its complete shape', () => {
		assert.strictEqual(createHash('sha256').update(fixtureText).digest('hex'), fixtureHash);

		const artifact = parseDiffGraphArtifact(fixtureText);
		assert.strictEqual(artifact.schema_version, '2.0');
		assert.strictEqual(artifact.files[0].classification?.analysis_source, 'structural');
		assert.strictEqual(artifact.symbols[0].location?.line_end, 2);
		assert.strictEqual(artifact.relationships[0].kind, 'defines');
		assert.strictEqual(artifact.metadata.privacy_tier, 'local');
		assert.strictEqual(artifact.summary, null);
	});

	test('rejects malformed JSON with a clear contract error', () => {
		assert.throws(
			() => parseDiffGraphArtifact('{"schema_version":'),
			(error: unknown) => error instanceof DiffGraphContractError && /Invalid DiffGraph JSON/.test(error.message),
		);
	});

	for (const version of [null, 2, '2', 'v2', '2.0.0', '02.0', '2.-1']) {
		test(`rejects malformed schema version ${JSON.stringify(version)}`, () => {
			const artifact = fixtureValue();
			artifact.schema_version = version;
			assert.throws(() => validateDiffGraphArtifact(artifact), /MAJOR\.MINOR/);
		});
	}

	test('rejects an unsupported schema major with a clear error', () => {
		const artifact = fixtureValue();
		artifact.schema_version = '3.0';
		assert.throws(
			() => validateDiffGraphArtifact(artifact),
			/Unsupported DiffGraph schema major 3; this consumer supports major 2/,
		);
	});

	test('accepts an additive v2 minor when the complete artifact remains schema-valid', () => {
		const artifact = fixtureValue();
		artifact.schema_version = '2.17';
		assert.strictEqual(validateDiffGraphArtifact(artifact).schema_version, '2.17');
	});

	for (const code of [
		'unmerged_index_entry',
		'invalid_base_ref',
		'invalid_head_ref',
		'merge_base_failed',
		'malformed_merge_base',
		'git_untracked_failed',
		'gitlink_head_failed',
		'malformed_gitlink_head',
		'pathspec_outside_repository',
		'undecodable_path',
	]) {
		test(`accepts the structured Git resolver warning ${code}`, () => {
			const artifact = fixtureValue();
			const metadata = artifact.metadata as Record<string, unknown>;
			metadata.warnings = [{ code, detail: 'Git could not resolve this comparison.' }];

			assert.strictEqual(validateDiffGraphArtifact(artifact).metadata.warnings?.[0]?.code, code);
		});
	}

	test('rejects a v2 minor artifact that no longer satisfies the packaged shape', () => {
		const artifact = fixtureValue();
		artifact.schema_version = '2.17';
		const metadata = artifact.metadata as Record<string, unknown>;
		delete metadata.privacy_tier;
		assert.throws(
			() => validateDiffGraphArtifact(artifact),
			/artifact validation failed at metadata: missing required property 'privacy_tier'/,
		);
	});

	test('fails closed on properties outside the consumer v2 shape', () => {
		const artifact = fixtureValue();
		artifact.unrecognized_claim = true;
		assert.throws(
			() => validateDiffGraphArtifact(artifact),
			/artifact validation failed at <root>\.unrecognized_claim: unknown property/,
		);
	});
});
