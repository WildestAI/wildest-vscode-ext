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
	assert.equal(typeof result.measurements.firstNativeGitHistoryReadMs, 'number');
	assert.equal(typeof result.measurements.secondNativeGitHistoryReadMs, 'number');
	assert.ok(result.measurements.firstNativeGitHistoryReadMs >= 0);
	assert.ok(result.measurements.secondNativeGitHistoryReadMs >= 0);
	assert.match(result.runtime.git, /^git version /);
	assert.match(result.notes.join(' '), /neither sample claims an OS-cold baseline/i);
});

test('history benchmark ignores a caller-supplied Git directory', async () => {
	const { stdout } = await execFileAsync(process.execPath, [script, '--commits', '50', '--json'], {
		env: { ...process.env, GIT_DIR: '/nonexistent/wildest-benchmark-git-dir' },
	});
	assert.equal(JSON.parse(stdout).measurements.commitsReturned, 50);
});

test('history benchmark rejects fixture sizes that cannot exercise the 50-commit history query', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, [script, '--commits', '49']),
		/--commits must be an integer from 50 to 10000/,
	);
});
