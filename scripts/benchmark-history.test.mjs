import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL('./benchmark-history.mjs', import.meta.url));

test('history benchmark emits reproducible, explicitly-scoped JSON measurements', async () => {
	const { stdout } = await execFileAsync(process.execPath, [script, '--commits', '50', '--json']);
	const result = JSON.parse(stdout);

	assert.deepEqual(result.fixture, { commits: 50, historyLimit: 50 });
	assert.equal(result.measurements.commitsReturned, 50);
	assert.equal(typeof result.measurements.coldNativeGitHistoryMs, 'number');
	assert.equal(typeof result.measurements.warmNativeGitHistoryMs, 'number');
	assert.ok(result.measurements.coldNativeGitHistoryMs >= 0);
	assert.ok(result.measurements.warmNativeGitHistoryMs >= 0);
	assert.match(result.runtime.git, /^git version /);
	assert.match(result.notes.join(' '), /does not claim an extension in-memory cache/i);
});

test('history benchmark rejects fixture sizes that cannot exercise the 50-commit history query', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, [script, '--commits', '49']),
		/--commits must be an integer from 50 to 10000/,
	);
});
