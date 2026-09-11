// Copyright (C) 2026 Wildest AI
// SPDX-License-Identifier: GPL-3.0-or-later

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function createElement() {
	return {
		classList: { add() {}, toggle() {} },
		style: {},
		append() {},
		appendChild() {},
		addEventListener() {},
		setAttribute() {},
		textContent: '',
	};
}

function loadRenderer() {
	const callbacks = [];
	const posted = [];
	let messageHandler;
	const app = createElement();
	const context = {
		acquireVsCodeApi: () => ({ getState: () => undefined, setState() {}, postMessage: message => posted.push(message) }),
		document: {
			body: createElement(),
			createElement,
			createElementNS: createElement,
			getElementById: () => app,
		},
		window: { addEventListener: (_event, handler) => { messageHandler = handler; } },
		requestAnimationFrame: callback => { callbacks.push(callback); },
		console,
	};
	vm.runInNewContext(fs.readFileSync('media/history/main.js', 'utf8'), context);
	return {
		posted,
		send: data => messageHandler({ data }),
		flushFrame: () => callbacks.splice(0).forEach(callback => callback()),
	};
}

test('does not acknowledge a cached graph replaced before its first paint', () => {
	const renderer = loadRenderer();
	renderer.send({ type: 'commits', commits: [], repoPath: '/repo', repoName: 'repo', cachePaintId: 1 });
	renderer.send({ type: 'commits', commits: [], repoPath: '/repo', repoName: 'repo' });
	renderer.flushFrame();
	renderer.flushFrame();
	assert.deepEqual(renderer.posted, []);
});

test('acknowledges a cached graph after two animation frames when it remains current', () => {
	const renderer = loadRenderer();
	renderer.send({ type: 'commits', commits: [], repoPath: '/repo', repoName: 'repo', cachePaintId: 7 });
	renderer.flushFrame();
	assert.deepEqual(renderer.posted, []);
	renderer.flushFrame();
	assert.equal(JSON.stringify(renderer.posted), JSON.stringify([{ command: 'cachedGraphRendered', cachePaintId: 7 }]));
});
