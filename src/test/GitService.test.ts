// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../services/GitService';

suite('GitService Test Suite', () => {
	test('fingerprints an untracked repository-root filename beginning with two dots', async () => {
		const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wildest-git-service-'));
		try {
			execFileSync('git', ['init', '--quiet', repoRoot]);
			await fs.writeFile(path.join(repoRoot, '..notes'), 'untracked content');

			const fingerprint = await GitService.getDiffContentFingerprint(repoRoot, false);

			assert.match(fingerprint, /^[a-f0-9]{64}$/);
		} finally {
			await fs.rm(repoRoot, { recursive: true, force: true });
		}
	});
});
