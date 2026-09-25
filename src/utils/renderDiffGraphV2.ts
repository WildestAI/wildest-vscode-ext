// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

import { DiffGraphV2 } from './diffGraphV2';

function escapeHtml(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

type SourceLocation = { file: string; line_start: number; line_end: number };

function formatLocation(location: SourceLocation): string {
	return `${location.file}:${location.line_start}${location.line_end !== location.line_start ? `-${location.line_end}` : ''}`;
}

function evidenceSummary(
	evidence: { kind: string; file?: string; line_start?: number; line_end?: number; snippet?: string } | undefined,
	location?: SourceLocation | null
): string {
	if (!evidence) {
		return location
			? `<p><strong>source location</strong> · ${escapeHtml(formatLocation(location))}</p>`
			: 'No source evidence was supplied.';
	}
	const evidenceLocation = evidence.file
		? `${evidence.file}${evidence.line_start ? `:${evidence.line_start}${evidence.line_end && evidence.line_end !== evidence.line_start ? `-${evidence.line_end}` : ''}` : ''}`
		: 'artifact metadata';
	const snippet = evidence.snippet ? `<pre>${escapeHtml(evidence.snippet)}</pre>` : '';
	return `<p><strong>${escapeHtml(evidence.kind)}</strong> · ${escapeHtml(evidenceLocation)}</p>${snippet}`;
}

/**
 * Render a validated canonical artifact without external scripts or network
 * dependencies. The host owns this VS Code-specific shell; it does not alter
 * the shared DiffGraph data contract.
 */
export function renderDiffGraphV2(artifact: DiffGraphV2): string {
	const files = [...artifact.files].sort((left, right) => left.id.localeCompare(right.id));
	const symbols = [...artifact.symbols].sort((left, right) => left.id.localeCompare(right.id));
	const relationships = [...artifact.relationships].sort((left, right) => left.id.localeCompare(right.id));
	const objectIds = new Set([...files, ...symbols].map(item => item.id));
	const objectCard = (kind: string, item: { id: string; name?: string; path?: string; change_kind: string; evidence?: DiffGraphV2['files'][number]['evidence']; location?: SourceLocation | null }) =>
		`<article id="${escapeHtml(item.id)}"><h3>${escapeHtml(item.name ?? item.path ?? item.id)}</h3><p><code>${escapeHtml(kind)}</code> · ${escapeHtml(item.change_kind)}</p>${evidenceSummary(item.evidence?.[0], item.location)}</article>`;
	const endpoint = (id: string) => objectIds.has(id)
		? `<a href="#${escapeHtml(id)}"><code>${escapeHtml(id)}</code></a>`
		: `<code>${escapeHtml(id)}</code>`;
	const relationshipCards = relationships.length
		? relationships.map(item => `<article><h3>${escapeHtml(item.kind)}</h3><p>${endpoint(item.source_id)} → ${endpoint(item.target_id)}</p><p>${escapeHtml(item.label ?? 'Deterministic structural relationship.')}</p>${evidenceSummary(item.evidence?.[0])}</article>`).join('')
		: '<p>No relationships in this artifact.</p>';
	const warningCards = artifact.metadata.warnings?.length
		? `<ul>${artifact.metadata.warnings.map(item => `<li><strong>${escapeHtml(item.code)}</strong>${item.file ? ` · ${escapeHtml(item.file)}` : ''}${item.detail ? ` — ${escapeHtml(item.detail)}` : ''}</li>`).join('')}</ul>`
		: '<p>None.</p>';

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>DiffGraph</title><style>
:root { color-scheme: light dark; font-family: var(--vscode-font-family, system-ui, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
body { max-width: 960px; margin: 0 auto; padding: 1rem; line-height: 1.45; } article { border: 1px solid var(--vscode-panel-border, #8886); border-radius: .4rem; margin: .75rem 0; padding: .75rem; } h1,h2,h3 { margin: .25rem 0 .5rem; } code,pre { font-family: var(--vscode-editor-font-family, ui-monospace, monospace); } pre { overflow-x: auto; white-space: pre-wrap; background: var(--vscode-textCodeBlock-background, #8882); padding: .5rem; border-radius: .25rem; } a { color: var(--vscode-textLink-foreground, #3794ff); } .meta { color: var(--vscode-descriptionForeground, #888); }
</style></head><body>
<h1>DiffGraph</h1><p class="meta">Schema v${escapeHtml(artifact.schema_version)} · generated ${escapeHtml(artifact.generated_at)} · wild ${escapeHtml(artifact.wild_version)}</p>
<section aria-labelledby="files"><h2 id="files">Files</h2>${files.length ? files.map(item => objectCard('file', item)).join('') : '<p>No files in this artifact.</p>'}</section>
<section aria-labelledby="symbols"><h2 id="symbols">Symbols</h2>${symbols.length ? symbols.map(item => objectCard(item.kind, item)).join('') : '<p>No symbols in this artifact.</p>'}</section>
<section aria-labelledby="relationships"><h2 id="relationships">Relationships</h2>${relationshipCards}</section>
<section aria-labelledby="warnings"><h2 id="warnings">Warnings</h2>${warningCards}</section>
</body></html>`;
}
