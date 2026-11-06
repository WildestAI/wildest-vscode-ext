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
	const repoRoot = path.resolve(__dirname, '../..');
	const fixturePath = path.join(repoRoot, 'src/test/fixtures/diffgraph-v2.structural.example.json');
	const fixtureText = fs.readFileSync(fixturePath, 'utf8');
	// The vendored schema and example are synced from the wild CLI; the source
	// file pins exactly which CLI revision they came from.
	const contractSource = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/contract/cli-contract-source.json'), 'utf8')) as {
		repository: string; ref: string; schemaSha256: string; exampleSha256: string;
	};
	const fixtureHash = contractSource.exampleSha256;
	const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

	function fixtureValue(): Record<string, unknown> {
		return JSON.parse(fixtureText) as Record<string, unknown>;
	}

	test('vendors the exact CLI schema recorded in the contract source', () => {
		assert.strictEqual(contractSource.repository, 'WildestAI/wild');
		assert.match(contractSource.ref, /^(cli-v\d+\.\d+\.\d+-[0-9a-f]{12}|[0-9a-f]{40})$/);
		const schema = fs.readFileSync(path.join(repoRoot, 'src/contract/diffgraph-v2.schema.json'));
		assert.strictEqual(sha256(schema), contractSource.schemaSha256);
	});

	test('vendors the exact canonical CLI fixture and accepts its complete shape', () => {
		assert.strictEqual(sha256(fixtureText), fixtureHash);

		const artifact = parseDiffGraphArtifact(fixtureText);
		assert.match(artifact.schema_version, /^2\.\d+$/);
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

	for (const name of fs.readdirSync(path.join(repoRoot, 'src/test/fixtures/cli')).sort()) {
		test(`accepts real CLI output ${name}`, () => {
			const text = fs.readFileSync(path.join(repoRoot, 'src/test/fixtures/cli', name), 'utf8');
			const artifact = parseDiffGraphArtifact(text);
			assert.match(artifact.schema_version, /^2\.\d+$/);
		});
	}

	test('accepts schema 2.1 context files, sources, diffs, summaries, inherits, and REF diffs', () => {
		const text = fs.readFileSync(path.join(repoRoot, 'src/test/fixtures/cli/cli-1.3.0-working-tree-summaries.json'), 'utf8');
		const artifact = parseDiffGraphArtifact(text);
		assert.strictEqual(artifact.diff_ref.kind, 'working_tree');
		assert.ok(artifact.files.some(file => file.change_kind === 'unchanged'));
		assert.ok(artifact.files.some(file => file.diff && typeof file.diff.unified === 'string'));
		assert.ok(artifact.symbols.some(symbol => symbol.source && 'before' in symbol.source));
		assert.ok([...artifact.files, ...artifact.symbols].some(node => node.summary?.analysis_source === 'inferred'));
		assert.ok(artifact.relationships.some(relationship => relationship.kind === 'inherits'));
	});

	test('accepts commit-range provenance fields', () => {
		const text = fs.readFileSync(path.join(repoRoot, 'src/test/fixtures/cli/cli-1.3.0-commit-range.json'), 'utf8');
		const artifact = parseDiffGraphArtifact(text);
		assert.strictEqual(artifact.diff_ref.comparison_mode, 'two_dot');
		assert.strictEqual(artifact.diff_ref.requested_base_ref, 'HEAD~1');
	});

	const tampered: Array<[string, (artifact: Record<string, any>) => void, RegExp]> = [
		['an unknown file change kind', a => { a.files[0].change_kind = 'teleported'; }, /files\[0\]\.change_kind: expected one of/],
		['an unknown key inside a symbol source', a => { a.symbols.find((s: any) => s.source).source.extra = 1; }, /source\.extra: unknown property/],
		['a summary without its llm_inference evidence', a => {
			const node = a.files.find((f: any) => f.summary);
			node.summary.evidence = node.summary.evidence.filter((e: any) => e.kind !== 'llm_inference');
		}, /summary\.evidence: no item matches a required entry/],
		['an unknown diff_ref kind', a => { a.diff_ref.kind = 'telepathy'; }, /diff_ref\.kind: expected one of/],
	];
	for (const [label, mutate, message] of tampered) {
		test(`rejects ${label}`, () => {
			const text = fs.readFileSync(path.join(repoRoot, 'src/test/fixtures/cli/cli-1.3.0-working-tree-summaries.json'), 'utf8');
			const artifact = JSON.parse(text) as Record<string, any>;
			mutate(artifact);
			assert.throws(() => validateDiffGraphArtifact(artifact), message);
		});
	}
});
