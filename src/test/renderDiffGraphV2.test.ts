import * as assert from 'assert';
import { DiffGraphV2 } from '../utils/diffGraphV2';
import { renderDiffGraphV2 } from '../utils/renderDiffGraphV2';

const fixture: DiffGraphV2 = {
	schema_version: '2.0', generated_at: '2026-09-25T00:00:00Z', wild_version: '1.1.1',
	diff_ref: { kind: 'unstaged', pathspecs: [] },
	files: [{ id: 'file::src/greeting.py', path: 'src/greeting.py', change_kind: 'modified', analysis_source: 'structural', evidence: [{ kind: 'ast_parse', file: 'src/greeting.py', line_start: 1, line_end: 2 }] }],
	symbols: [{ id: 'sym::src/greeting.py::greet', name: 'greet', file_id: 'file::src/greeting.py', kind: 'function', change_kind: 'modified', analysis_source: 'structural', location: { file: 'src/greeting.py', line_start: 1, line_end: 2 } }],
	relationships: [{ id: 'rel::file::src/greeting.py->sym::src/greeting.py::greet', kind: 'defines', source_id: 'file::src/greeting.py', target_id: 'sym::src/greeting.py::greet', analysis_source: 'structural', evidence: [{ kind: 'structural_basis' }] }],
	metadata: { privacy_tier: 'local', warnings: [] }
};

suite('DiffGraph v2 webview renderer', () => {
	test('renders canonical topology with offline CSP and evidence links', () => {
		const html = renderDiffGraphV2(fixture);

		assert.match(html, /default-src 'none'; style-src 'unsafe-inline'/);
		assert.match(html, /Schema v2\.0/);
		assert.match(html, /Files/);
		assert.match(html, /Symbols/);
		assert.match(html, /Relationships/);
		assert.match(html, /href="#file::src\/greeting\.py"/);
		assert.ok(!html.includes('<script'));
	});

	test('renders a symbol source location when no evidence is supplied', () => {
		const artifact = structuredClone(fixture);
		artifact.symbols[0].location = { file: 'src/<greeting>.py', line_start: 3, line_end: 5 };

		const html = renderDiffGraphV2(artifact);

		assert.match(html, /source location<\/strong> · src\/&lt;greeting&gt;\.py:3-5/);
		assert.ok(!html.includes('No source evidence was supplied.'));
	});

	test('escapes artifact-controlled labels and snippets', () => {
		const artifact = structuredClone(fixture);
		artifact.relationships[0].label = '</article><img src=x onerror=alert(1)>';
		artifact.relationships[0].evidence = [{ kind: 'call_site', snippet: '<script>alert(1)</script>' }];

		const html = renderDiffGraphV2(artifact);

		assert.ok(!html.includes('<img src=x'));
		assert.ok(!html.includes('<script>alert(1)</script>'));
		assert.match(html, /&lt;\/article&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
	});
});
