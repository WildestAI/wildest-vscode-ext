// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

/** Runtime contract for canonical DiffGraph v2 JSON artifacts. */

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

export interface DiffGraphFile {
	id: string;
	path: string;
	old_path?: string | null;
	language?: string | null;
	change_kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'renamed_modified';
	lines_added?: number | null;
	lines_removed?: number | null;
	analysis_source: 'structural';
	evidence?: DiffGraphEvidence[];
	classification?: {
		is_test: boolean;
		analysis_source: AnalysisSource;
		evidence?: DiffGraphEvidence[];
	} | null;
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
		kind: 'unstaged' | 'staged' | 'commit_range' | 'file_scope';
		base_ref?: string | null;
		head_ref?: string | null;
		pathspecs?: string[];
		repo_root?: string;
	};
	files: DiffGraphFile[];
	symbols: DiffGraphSymbol[];
	relationships: DiffGraphRelationship[];
	summary?: {
		text: string;
		analysis_source: 'inferred';
		confidence?: number | null;
		evidence: DiffGraphEvidence[];
	} | null;
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

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const analysisSources = ['structural', 'inferred', 'derived'] as const;
const evidenceKinds = ['git_diff_stat', 'git_diff_name_status', 'path_pattern', 'ast_parse',
	'import_statement', 'call_site', 'llm_inference', 'structural_basis'] as const;

function fail(path: string, detail: string): never {
	throw new DiffGraphContractError(`DiffGraph artifact validation failed at ${path}: ${detail}`);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fail(path, 'expected an object');
	}
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
	const unknown = Object.keys(value).find(key => !allowed.includes(key));
	if (unknown) {
		fail(`${path}.${unknown}`, 'unknown property');
	}
}

function required(value: Record<string, unknown>, keys: readonly string[], path: string): void {
	const missing = keys.find(key => !(key in value));
	if (missing) {
		fail(path, `missing required property '${missing}'`);
	}
}

function stringAt(value: unknown, path: string): asserts value is string {
	if (typeof value !== 'string') {
		fail(path, 'expected a string');
	}
}

function enumAt<T extends string>(value: unknown, allowed: readonly T[], path: string): asserts value is T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		fail(path, `expected one of ${allowed.join(', ')}`);
	}
}

function booleanAt(value: unknown, path: string): void {
	if (typeof value !== 'boolean') {
		fail(path, 'expected a boolean');
	}
}

function numberAt(value: unknown, path: string, minimum = 0, maximum?: number): void {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (maximum !== undefined && value > maximum)) {
		fail(path, `expected a number from ${minimum}${maximum === undefined ? '' : ` to ${maximum}`}`);
	}
}

function integerAt(value: unknown, path: string, minimum = 0): void {
	numberAt(value, path, minimum);
	if (!Number.isInteger(value)) {
		fail(path, 'expected an integer');
	}
}

function nullable<T>(value: unknown, validate: (candidate: unknown) => T): void {
	if (value !== null) {
		validate(value);
	}
}

function arrayAt(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) {
		fail(path, 'expected an array');
	}
	return value;
}

function stringArrayAt(value: unknown, path: string): void {
	arrayAt(value, path).forEach((item, index) => stringAt(item, `${path}[${index}]`));
}

function optional(value: Record<string, unknown>, key: string, validate: (candidate: unknown, path: string) => void, path: string): void {
	if (key in value) {
		validate(value[key], `${path}.${key}`);
	}
}

function evidenceAt(value: unknown, path: string): DiffGraphEvidence {
	const evidence = objectAt(value, path);
	required(evidence, ['kind'], path);
	enumAt(evidence.kind, evidenceKinds, `${path}.kind`);
	for (const key of ['file', 'snippet', 'pattern', 'detail', 'model', 'prompt_ref']) {
		optional(evidence, key, stringAt, path);
	}
	for (const key of ['line_start', 'line_end']) {
		optional(evidence, key, (item, itemPath) => integerAt(item, itemPath, 1), path);
	}
	optional(evidence, 'temperature', (item, itemPath) => numberAt(item, itemPath, 0, 2), path);
	for (const key of ['symbol_ids', 'file_ids']) {
		optional(evidence, key, stringArrayAt, path);
	}
	return evidence as unknown as DiffGraphEvidence;
}

function evidenceArrayAt(value: unknown, path: string): DiffGraphEvidence[] {
	return arrayAt(value, path).map((item, index) => evidenceAt(item, `${path}[${index}]`));
}

function classificationAt(value: unknown, path: string): void {
	if (value === null) { return; }
	const classification = objectAt(value, path);
	exactKeys(classification, ['is_test', 'analysis_source', 'evidence'], path);
	required(classification, ['is_test', 'analysis_source'], path);
	booleanAt(classification.is_test, `${path}.is_test`);
	enumAt(classification.analysis_source, analysisSources, `${path}.analysis_source`);
	optional(classification, 'evidence', evidenceArrayAt, path);
}

function fileAt(value: unknown, path: string): DiffGraphFile {
	const file = objectAt(value, path);
	exactKeys(file, ['id', 'path', 'old_path', 'language', 'change_kind', 'lines_added', 'lines_removed',
		'analysis_source', 'evidence', 'classification'], path);
	required(file, ['id', 'path', 'change_kind', 'analysis_source'], path);
	stringAt(file.id, `${path}.id`);
	if (!file.id.startsWith('file::')) { fail(`${path}.id`, "expected prefix 'file::'"); }
	stringAt(file.path, `${path}.path`);
	optional(file, 'old_path', (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	optional(file, 'language', (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	enumAt(file.change_kind, ['added', 'modified', 'deleted', 'renamed', 'renamed_modified'], `${path}.change_kind`);
	for (const key of ['lines_added', 'lines_removed']) {
		optional(file, key, (item, itemPath) => nullable(item, candidate => integerAt(candidate, itemPath)), path);
	}
	if (file.analysis_source !== 'structural') { fail(`${path}.analysis_source`, "expected 'structural'"); }
	optional(file, 'evidence', evidenceArrayAt, path);
	optional(file, 'classification', classificationAt, path);
	return file as unknown as DiffGraphFile;
}

function symbolAt(value: unknown, path: string): DiffGraphSymbol {
	const symbol = objectAt(value, path);
	exactKeys(symbol, ['id', 'name', 'qualified_name', 'file_id', 'kind', 'parent_id', 'change_kind',
		'analysis_source', 'location', 'evidence'], path);
	required(symbol, ['id', 'name', 'file_id', 'kind', 'change_kind', 'analysis_source'], path);
	stringAt(symbol.id, `${path}.id`);
	if (!/^sym::.+::.+/.test(symbol.id)) { fail(`${path}.id`, 'invalid symbol id'); }
	stringAt(symbol.name, `${path}.name`);
	optional(symbol, 'qualified_name', (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	stringAt(symbol.file_id, `${path}.file_id`);
	if (!symbol.file_id.startsWith('file::')) { fail(`${path}.file_id`, "expected prefix 'file::'"); }
	enumAt(symbol.kind, ['function', 'class', 'method', 'import', 'constant', 'type_alias', 'module'], `${path}.kind`);
	optional(symbol, 'parent_id', (item, itemPath) => nullable(item, candidate => {
		stringAt(candidate, itemPath);
		if (!/^sym::.+::.+/.test(candidate)) { fail(itemPath, 'invalid parent symbol id'); }
	}), path);
	enumAt(symbol.change_kind, ['added', 'modified', 'deleted', 'unchanged'], `${path}.change_kind`);
	enumAt(symbol.analysis_source, analysisSources, `${path}.analysis_source`);
	optional(symbol, 'location', locationAt, path);
	optional(symbol, 'evidence', evidenceArrayAt, path);
	if (symbol.analysis_source === 'inferred' && (!Array.isArray(symbol.evidence) || symbol.evidence.length === 0)) {
		fail(`${path}.evidence`, 'inferred symbols require evidence');
	}
	return symbol as unknown as DiffGraphSymbol;
}

function locationAt(value: unknown, path: string): void {
	if (value === null) { return; }
	const location = objectAt(value, path);
	exactKeys(location, ['file', 'line_start', 'line_end'], path);
	required(location, ['file', 'line_start', 'line_end'], path);
	stringAt(location.file, `${path}.file`);
	integerAt(location.line_start, `${path}.line_start`, 1);
	integerAt(location.line_end, `${path}.line_end`, 1);
}

function relationshipAt(value: unknown, path: string): DiffGraphRelationship {
	const relationship = objectAt(value, path);
	exactKeys(relationship, ['id', 'kind', 'source_id', 'target_id', 'analysis_source', 'confidence',
		'resolution_method', 'evidence', 'label'], path);
	required(relationship, ['id', 'kind', 'source_id', 'target_id', 'analysis_source'], path);
	for (const key of ['id', 'source_id', 'target_id']) { stringAt(relationship[key], `${path}.${key}`); }
	if (!/^rel::.+->.+/.test(relationship.id as string)) { fail(`${path}.id`, 'invalid relationship id'); }
	enumAt(relationship.kind, ['imports', 'calls', 'inherits', 'implements', 'defines', 'contains',
		'semantic_related', 'co_changed'], `${path}.kind`);
	enumAt(relationship.analysis_source, analysisSources, `${path}.analysis_source`);
	optional(relationship, 'confidence', (item, itemPath) => nullable(item, candidate => numberAt(candidate, itemPath, 0, 1)), path);
	optional(relationship, 'resolution_method', (item, itemPath) => nullable(item,
		candidate => enumAt(candidate, ['import_grounded', 'resolved', 'heuristic'], itemPath)), path);
	optional(relationship, 'evidence', evidenceArrayAt, path);
	optional(relationship, 'label', (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	if (relationship.analysis_source === 'inferred') {
		if (typeof relationship.confidence !== 'number') { fail(`${path}.confidence`, 'inferred relationships require confidence'); }
		if (!Array.isArray(relationship.evidence) || relationship.evidence.length === 0) { fail(`${path}.evidence`, 'inferred relationships require evidence'); }
	}
	return relationship as unknown as DiffGraphRelationship;
}

function summaryAt(value: unknown, path: string): void {
	if (value === null) { return; }
	const summary = objectAt(value, path);
	exactKeys(summary, ['text', 'analysis_source', 'confidence', 'evidence'], path);
	required(summary, ['text', 'analysis_source', 'evidence'], path);
	stringAt(summary.text, `${path}.text`);
	if (summary.analysis_source !== 'inferred') { fail(`${path}.analysis_source`, "expected 'inferred'"); }
	optional(summary, 'confidence', (item, itemPath) => nullable(item, candidate => numberAt(candidate, itemPath, 0, 1)), path);
	const evidence = evidenceArrayAt(summary.evidence, `${path}.evidence`);
	for (const kind of ['llm_inference', 'structural_basis']) {
		if (!evidence.some(item => item.kind === kind)) { fail(`${path}.evidence`, `missing ${kind} evidence`); }
	}
}

function diffRefAt(value: unknown, path: string): void {
	const diffRef = objectAt(value, path);
	exactKeys(diffRef, ['kind', 'base_ref', 'head_ref', 'pathspecs', 'repo_root'], path);
	required(diffRef, ['kind'], path);
	enumAt(diffRef.kind, ['unstaged', 'staged', 'commit_range', 'file_scope'], `${path}.kind`);
	for (const key of ['base_ref', 'head_ref']) {
		optional(diffRef, key, (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	}
	optional(diffRef, 'pathspecs', stringArrayAt, path);
	optional(diffRef, 'repo_root', stringAt, path);
}

// Keep this in lockstep with DiffGraph-CLI's v2 warning enum. These resolver
// failures are intentionally structured: the webview can show an actionable
// state without treating a failed ref or merge-base lookup as an empty diff.
const warningCodes = ['PARSE_FAILURE', 'UNSUPPORTED_LANGUAGE', 'PARTIAL_ANALYSIS', 'LLM_TIMEOUT', 'LLM_ERROR',
	'UNKNOWN', 'not_a_git_repository', 'git_diff_failed', 'malformed_git_output', 'missing_object_id',
	'unsupported_worktree_entry', 'worktree_read_failed', 'hash_object_failed', 'malformed_hash_object_output',
	'unmerged_index_entry', 'invalid_base_ref', 'invalid_head_ref', 'merge_base_failed',
	'malformed_merge_base', 'git_untracked_failed', 'gitlink_head_failed', 'malformed_gitlink_head',
	'pathspec_outside_repository', 'undecodable_path'] as const;

function metadataAt(value: unknown, path: string): void {
	const metadata = objectAt(value, path);
	exactKeys(metadata, ['privacy_tier', 'cloud_providers_used', 'analysis_duration_ms', 'languages_detected',
		'files_analyzed', 'files_skipped', 'llm_calls', 'llm_model', 'tiers_used', 'warnings'], path);
	required(metadata, ['privacy_tier'], path);
	enumAt(metadata.privacy_tier, ['local', 'cloud_llm', 'cloud_backend'], `${path}.privacy_tier`);
	for (const key of ['cloud_providers_used', 'languages_detected']) { optional(metadata, key, stringArrayAt, path); }
	for (const key of ['analysis_duration_ms', 'files_analyzed', 'files_skipped', 'llm_calls']) {
		optional(metadata, key, (item, itemPath) => nullable(item, candidate => integerAt(candidate, itemPath)), path);
	}
	optional(metadata, 'llm_model', (item, itemPath) => nullable(item, candidate => stringAt(candidate, itemPath)), path);
	optional(metadata, 'tiers_used', (item, itemPath) => arrayAt(item, itemPath).forEach((entry, index) =>
		enumAt(entry, analysisSources, `${itemPath}[${index}]`)), path);
	optional(metadata, 'warnings', (item, itemPath) => arrayAt(item, itemPath).forEach((entry, index) => {
		const warningPath = `${itemPath}[${index}]`;
		const warning = objectAt(entry, warningPath);
		exactKeys(warning, ['code', 'file', 'detail'], warningPath);
		required(warning, ['code'], warningPath);
		enumAt(warning.code, warningCodes, `${warningPath}.code`);
		optional(warning, 'file', stringAt, warningPath);
		optional(warning, 'detail', stringAt, warningPath);
	}), path);
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
	const artifact = objectAt(value, '<root>');
	exactKeys(artifact, ['schema_version', 'generated_at', 'wild_version', 'diff_ref', 'files', 'symbols',
		'relationships', 'summary', 'metadata'], '<root>');
	required(artifact, ['schema_version', 'generated_at', 'wild_version', 'diff_ref', 'files', 'symbols',
		'relationships', 'metadata'], '<root>');

	if (typeof artifact.schema_version !== 'string') {
		throw new DiffGraphContractError(`DiffGraph schema_version must use MAJOR.MINOR format; received ${JSON.stringify(artifact.schema_version)}`);
	}
	const match = versionPattern.exec(artifact.schema_version);
	if (!match) {
		throw new DiffGraphContractError(`DiffGraph schema_version must use MAJOR.MINOR format; received ${JSON.stringify(artifact.schema_version)}`);
	}
	const major = Number(match[1]);
	if (major !== supportedDiffGraphSchemaMajor) {
		throw new DiffGraphContractError(`Unsupported DiffGraph schema major ${major}; this consumer supports major ${supportedDiffGraphSchemaMajor}`);
	}

	stringAt(artifact.generated_at, 'generated_at');
	if (!dateTimePattern.test(artifact.generated_at) || Number.isNaN(Date.parse(artifact.generated_at))) {
		fail('generated_at', 'expected an ISO 8601 date-time');
	}
	stringAt(artifact.wild_version, 'wild_version');
	diffRefAt(artifact.diff_ref, 'diff_ref');
	arrayAt(artifact.files, 'files').forEach((item, index) => fileAt(item, `files[${index}]`));
	arrayAt(artifact.symbols, 'symbols').forEach((item, index) => symbolAt(item, `symbols[${index}]`));
	arrayAt(artifact.relationships, 'relationships').forEach((item, index) => relationshipAt(item, `relationships[${index}]`));
	optional(artifact, 'summary', summaryAt, '<root>');
	metadataAt(artifact.metadata, 'metadata');
	return artifact as unknown as DiffGraphV2;
}
