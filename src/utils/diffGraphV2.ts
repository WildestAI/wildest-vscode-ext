// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Runtime contract for canonical DiffGraph v2 JSON artifacts.
 *
 * The allowed shape comes from the wild CLI's own packaged JSON Schema,
 * vendored in src/contract/ and refreshed from each CLI release by the
 * release handoff. Validation stays fail-closed (unknown properties and enum
 * values are rejected exactly where the CLI's schema rejects them), but a new
 * additive schema minor only needs the vendored schema synced, not new code.
 */

import * as schemaModule from '../contract/diffgraph-v2.schema.json';

export const supportedDiffGraphSchemaMajor = 2;

export type AnalysisSource = 'structural' | 'inferred' | 'derived';

export interface DiffGraphEvidence {
	kind: 'git_diff_stat' | 'git_diff_name_status' | 'path_pattern' | 'ast_parse' |
	'import_statement' | 'call_site' | 'llm_inference' | 'structural_basis';
	file?: string;
	line_start?: number;
	line_end?: number;
	snippet?: string;
	pattern?: string;
	detail?: string;
	model?: string;
	prompt_ref?: string;
	temperature?: number;
	symbol_ids?: string[];
	file_ids?: string[];
	[key: string]: unknown;
}

/** Optional AI prose attached to a node (schema 2.1+); always `inferred`. */
export interface DiffGraphSummary {
	text: string;
	analysis_source: 'inferred';
	confidence?: number | null;
	evidence: DiffGraphEvidence[];
}

/** Exact declaration text on one side of a changed symbol (schema 2.1+). */
export interface DiffGraphSourceSpan {
	line_start: number;
	text: string;
	truncated: boolean;
}

export interface DiffGraphFile {
	id: string;
	path: string;
	old_path?: string | null;
	language?: string | null;
	/** `unchanged` marks a context file outside the diff (callers/importers). */
	change_kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'renamed_modified' | 'unchanged';
	lines_added?: number | null;
	lines_removed?: number | null;
	analysis_source: 'structural';
	evidence?: DiffGraphEvidence[];
	classification?: {
		is_test: boolean;
		analysis_source: AnalysisSource;
		evidence?: DiffGraphEvidence[];
	} | null;
	summary?: DiffGraphSummary | null;
	diff?: { unified: string; truncated: boolean };
}

export interface DiffGraphSymbol {
	id: string;
	name: string;
	qualified_name?: string | null;
	file_id: string;
	kind: 'function' | 'class' | 'method' | 'import' | 'constant' | 'type_alias' | 'module';
	parent_id?: string | null;
	change_kind: 'added' | 'modified' | 'deleted' | 'unchanged';
	analysis_source: AnalysisSource;
	location?: { file: string; line_start: number; line_end: number } | null;
	evidence?: DiffGraphEvidence[];
	summary?: DiffGraphSummary | null;
	source?: { before: DiffGraphSourceSpan | null; after: DiffGraphSourceSpan | null };
}

export interface DiffGraphRelationship {
	id: string;
	kind: 'imports' | 'calls' | 'inherits' | 'implements' | 'defines' | 'contains' |
	'semantic_related' | 'co_changed';
	source_id: string;
	target_id: string;
	analysis_source: AnalysisSource;
	confidence?: number | null;
	resolution_method?: 'import_grounded' | 'resolved' | 'heuristic' | null;
	evidence?: DiffGraphEvidence[];
	label?: string | null;
}

export interface DiffGraphV2 {
	schema_version: string;
	generated_at: string;
	wild_version: string;
	diff_ref: {
		kind: 'unstaged' | 'staged' | 'commit_range' | 'working_tree' | 'file_scope';
		base_ref?: string | null;
		head_ref?: string | null;
		requested_base_ref?: string | null;
		requested_head_ref?: string | null;
		comparison_mode?: 'two_dot' | 'three_dot' | null;
		pathspecs?: string[];
		repo_root?: string;
	};
	files: DiffGraphFile[];
	symbols: DiffGraphSymbol[];
	relationships: DiffGraphRelationship[];
	summary?: DiffGraphSummary | null;
	metadata: {
		privacy_tier: 'local' | 'cloud_llm' | 'cloud_backend';
		cloud_providers_used?: string[];
		analysis_duration_ms?: number | null;
		languages_detected?: string[];
		files_analyzed?: number | null;
		files_skipped?: number | null;
		llm_calls?: number | null;
		llm_model?: string | null;
		tiers_used?: AnalysisSource[];
		warnings?: Array<{ code: string; file?: string; detail?: string }>;
	};
}

export class DiffGraphContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DiffGraphContractError';
	}
}

type Schema = Record<string, unknown>;

/** The wild CLI's packaged DiffGraph v2 schema (JSON imports may be wrapped in `default`). */
const rootSchema: Schema = ((schemaModule as unknown as { default?: Schema }).default ?? schemaModule) as Schema;

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const patternCache = new Map<string, RegExp>();

function fail(path: string, detail: string): never {
	throw new DiffGraphContractError(`DiffGraph artifact validation failed at ${path}: ${detail}`);
}

function childPath(path: string, key: string): string {
	return path === '<root>' ? key : `${path}.${key}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveRef(ref: string): Schema {
	if (!ref.startsWith('#/')) {
		throw new DiffGraphContractError(`DiffGraph schema uses an unsupported $ref ${ref}`);
	}
	let node: unknown = rootSchema;
	for (const part of ref.slice(2).split('/')) {
		node = isObject(node) ? node[part] : undefined;
	}
	if (!isObject(node)) {
		throw new DiffGraphContractError(`DiffGraph schema $ref ${ref} does not resolve`);
	}
	return node;
}

function matchesType(value: unknown, type: string): boolean {
	switch (type) {
		case 'null': return value === null;
		case 'boolean': return typeof value === 'boolean';
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number' && Number.isFinite(value);
		case 'integer': return typeof value === 'number' && Number.isInteger(value);
		case 'array': return Array.isArray(value);
		case 'object': return isObject(value);
		default: throw new DiffGraphContractError(`DiffGraph schema uses an unsupported type ${type}`);
	}
}

function sameValue(left: unknown, right: unknown): boolean {
	return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function passes(value: unknown, schema: Schema, path: string): DiffGraphContractError | undefined {
	try {
		check(value, schema, path);
		return undefined;
	} catch (error) {
		if (error instanceof DiffGraphContractError) {
			return error;
		}
		throw error;
	}
}

/** Validate ``value`` against a JSON Schema (2020-12) node, for the keywords the CLI schema uses. */
function check(value: unknown, schema: Schema, path: string): void {
	if (typeof schema.$ref === 'string') {
		check(value, resolveRef(schema.$ref), path);
	}
	if (schema.type !== undefined) {
		const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
		if (!types.some(type => matchesType(value, type))) {
			fail(path, `expected ${types.join(' or ')}`);
		}
	}
	if ('const' in schema && !sameValue(value, schema.const)) {
		fail(path, `expected ${JSON.stringify(schema.const)}`);
	}
	if (Array.isArray(schema.enum) && !schema.enum.some(option => sameValue(option, value))) {
		fail(path, `expected one of ${schema.enum.map(option => JSON.stringify(option)).join(', ')}`);
	}
	if (typeof value === 'string') {
		if (typeof schema.pattern === 'string') {
			let pattern = patternCache.get(schema.pattern);
			if (!pattern) {
				pattern = new RegExp(schema.pattern, 'u');
				patternCache.set(schema.pattern, pattern);
			}
			if (!pattern.test(value)) {
				fail(path, `does not match pattern ${schema.pattern}`);
			}
		}
		if (schema.format === 'date-time' && (!dateTimePattern.test(value) || Number.isNaN(Date.parse(value)))) {
			fail(path, 'expected an ISO 8601 date-time');
		}
	}
	if (typeof value === 'number') {
		if (typeof schema.minimum === 'number' && value < schema.minimum) {
			fail(path, `expected a value of at least ${schema.minimum}`);
		}
		if (typeof schema.maximum === 'number' && value > schema.maximum) {
			fail(path, `expected a value of at most ${schema.maximum}`);
		}
	}
	if (Array.isArray(value)) {
		if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
			fail(path, `expected at least ${schema.minItems} item(s)`);
		}
		if (isObject(schema.items)) {
			const items = schema.items;
			value.forEach((item, index) => check(item, items, `${path}[${index}]`));
		}
		if (isObject(schema.contains)) {
			const contains = schema.contains;
			if (!value.some((item, index) => passes(item, contains, `${path}[${index}]`) === undefined)) {
				fail(path, 'no item matches a required entry');
			}
		}
	}
	if (isObject(value)) {
		if (Array.isArray(schema.required)) {
			for (const key of schema.required as string[]) {
				if (!(key in value)) {
					fail(path, `missing required property '${key}'`);
				}
			}
		}
		const properties = isObject(schema.properties) ? schema.properties : {};
		for (const [key, item] of Object.entries(value)) {
			const propertySchema = properties[key];
			if (isObject(propertySchema)) {
				check(item, propertySchema, childPath(path, key));
			} else if (schema.additionalProperties === false) {
				fail(`${path}.${key}`, 'unknown property');
			} else if (isObject(schema.additionalProperties)) {
				check(item, schema.additionalProperties, childPath(path, key));
			}
		}
	}
	if (Array.isArray(schema.allOf)) {
		for (const part of schema.allOf as Schema[]) {
			check(value, part, path);
		}
	}
	if (Array.isArray(schema.oneOf)) {
		const errors = (schema.oneOf as Schema[]).map(option => passes(value, option, path));
		const matched = errors.filter(error => error === undefined).length;
		if (matched > 1) {
			fail(path, 'matches more than one allowed shape');
		}
		if (matched === 0) {
			// Report the most specific failure (the longest, deepest message),
			// e.g. the field inside an object rather than "expected null".
			const deepest = (errors as DiffGraphContractError[]).reduce((best, error) =>
				error.message.length > best.message.length ? error : best);
			throw deepest;
		}
	}
	if (isObject(schema.if)) {
		const branch = passes(value, schema.if, path) === undefined ? schema.then : schema.else;
		if (isObject(branch)) {
			check(value, branch, path);
		}
	}
}

/** Parse JSON and reject anything that is not provably compatible with v2. */
export function parseDiffGraphArtifact(text: string): DiffGraphV2 {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new DiffGraphContractError(`Invalid DiffGraph JSON: ${detail}`);
	}
	return validateDiffGraphArtifact(value);
}

/** Validate the complete canonical v2 shape. v2 minor bumps remain schema-bound. */
export function validateDiffGraphArtifact(value: unknown): DiffGraphV2 {
	if (!isObject(value)) {
		fail('<root>', 'expected object');
	}
	const version = value.schema_version;
	if (typeof version !== 'string' || !versionPattern.test(version)) {
		throw new DiffGraphContractError(`DiffGraph schema_version must use MAJOR.MINOR format; received ${JSON.stringify(version)}`);
	}
	const major = Number(versionPattern.exec(version)![1]);
	if (major !== supportedDiffGraphSchemaMajor) {
		throw new DiffGraphContractError(`Unsupported DiffGraph schema major ${major}; this consumer supports major ${supportedDiffGraphSchemaMajor}`);
	}
	check(value, rootSchema, '<root>');
	return value as unknown as DiffGraphV2;
}
