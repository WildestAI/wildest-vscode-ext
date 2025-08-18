// Copyright (C) 2025  Wildest AI
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { DiffService } from '../services/DiffService';
import { DiffGraphViewProvider } from '../providers/DiffGraphViewProvider';

suite('DiffService Test Suite', () => {
	let mockContext: vscode.ExtensionContext;

	setup(() => {
		mockContext = {
			extensionPath: '/mock/extension/path'
		} as unknown as vscode.ExtensionContext;
	});

	test('DiffService can be instantiated', () => {
		const diffService = new DiffService(mockContext);
		assert.ok(diffService);
	});

	test('DiffService can be instantiated with provider', () => {
		const mockProvider = {
			showLoadingScreen: async () => {},
			showDiffGraph: async (htmlPath: string) => {}
		} as unknown as DiffGraphViewProvider;
		
		const diffService = new DiffService(mockContext, mockProvider);
		assert.ok(diffService);
	});
});
