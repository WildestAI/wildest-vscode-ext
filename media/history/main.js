// media/history/main.js
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

/**
 * This renderer uses a simplified version of VS Code's SCM "swimlane" algorithm.
 * It computes input/output swimlanes per row from commit parents so vertical lines
 * connect seamlessly across rows, and merges/forks are drawn with arcs.
 */

// Initialize state from previous session or default values
const state = vscode.getState() || {
	repoPath: '',
	repoName: '',
	commits: [],
	isRefreshing: false
};

// Create loading overlay
const loadingOverlay = document.createElement('div');
loadingOverlay.className = 'loading-overlay';
loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
document.body.appendChild(loadingOverlay);

window.addEventListener('message', e => {
	const { type } = e.data;

	switch (type) {
		case 'loading':
			loadingOverlay.classList.toggle('visible', e.data.state);
			break;
		case 'commits':
			updateState(e.data);
			renderList(state.commits, state.repoPath);
			break;
		case 'refreshing':
			state.isRefreshing = e.data.state;
			break;
		case 'error':
			state.isRefreshing = false;
			break;
	}
});

function updateState(data) {
	state.repoPath = data.repoPath;
	state.repoName = data.repoName;
	state.commits = data.commits;
}

// --- constants (based on VS Code's scmHistory.ts) ---
const SWIMLANE_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const SWIMLANE_CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE_WIDTH = 2;

// Graph colors (same palette order as VS Code's `colorRegistry`)
const LANE_COLORS = ['#FFB000', '#DC267F', '#994F00', '#40B0A6', '#B66DFF'];
const DEFAULT_REF_COLOR = '#007acc';

// ---------- utilities ----------
function rot(n, m) { return ((n % m) + m) % m; }
function deepClone(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : obj; }

function createSvgElement(name, attrs = {}) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', name);
	for (const [k, v] of Object.entries(attrs)) { el.setAttribute(String(k), String(v)); }
	return el;
}
function createPath(stroke = '#888', strokeWidth = 1) {
	const p = createSvgElement('path', { fill: 'none', 'stroke-linecap': 'round' });
	p.style.stroke = stroke;
	p.style.strokeWidth = `${strokeWidth}px`;
	return p;
}
function drawCircle(index, radius, strokeWidth = 1, fillColor = 'none', strokeColor = DEFAULT_REF_COLOR) {
	const c = createSvgElement('circle', {
		cx: String(SWIMLANE_WIDTH * (index + 1)),
		cy: String(SWIMLANE_HEIGHT / 2),
		r: String(radius)
	});
	c.setAttribute('stroke', strokeColor);
	c.setAttribute('stroke-width', `${strokeWidth}px`);
	c.setAttribute('fill', fillColor);
	return c;
}
function drawVerticalLine(x, y1, y2, color, strokeWidth = 1) {
	const path = createPath(color, strokeWidth);
	path.setAttribute('d', `M ${x} ${y1} V ${y2}`);
	return path;
}
function findLastIndex(nodes, id) {
	for (let i = nodes.length - 1; i >= 0; i--) {
		if (nodes[i].id === id) { return i; }
	}
	return -1;
}

// ---------- swimlane VM (adapted from VS Code's `toISCMHistoryItemViewModelArray`) ----------
function buildViewModels(historyItems) {
	let colorIndex = -1;
	const vms = [];

	for (let idx = 0; idx < historyItems.length; idx++) {
		const item = historyItems[idx];
		const parents = Array.isArray(item.parents) ? item.parents : [];

		const prevOutput = vms.at(-1)?.outputSwimlanes ?? [];
		const inputSwimlanes = prevOutput.map(n => deepClone(n));
		const outputSwimlanes = [];

		let firstParentAdded = false;

		// Remove current node from lanes and replace it with first parent (keeping color)
		if (parents.length > 0) {
			for (const node of inputSwimlanes) {
				if (node.id === item.hash) {
					if (!firstParentAdded) {
						// Keep lane color for the first parent
						outputSwimlanes.push({
							id: parents[0],
							color: node.color || DEFAULT_REF_COLOR
						});
						firstParentAdded = true;
					}
					continue; // drop current node from lanes
				}
				outputSwimlanes.push(deepClone(node));
			}
		}

		// Add remaining parents as new lanes (and first parent if we didn't replace)
		for (let i = firstParentAdded ? 1 : 0; i < parents.length; i++) {
			colorIndex = rot(colorIndex + 1, LANE_COLORS.length);
			outputSwimlanes.push({
				id: parents[i],
				color: LANE_COLORS[colorIndex]
			});
		}

		// isCurrent (HEAD) – we infer from refs containing HEAD
		const isCurrent = Array.isArray(item.refs) && item.refs.some(r => String(r).includes('HEAD'));

		vms.push({
			historyItem: item,
			isCurrent,
			inputSwimlanes,
			outputSwimlanes
		});
	}

	return vms;
}

// ---------- per-row graph renderer (adapted from VS Code's `renderSCMHistoryItemGraph`) ----------
function renderRowGraph(vm) {
	const svg = createSvgElement('svg');
	svg.classList.add('graph');
	const item = vm.historyItem;
	const inputs = vm.inputSwimlanes;
	const outputs = vm.outputSwimlanes;

	const inputIndex = inputs.findIndex(n => n.id === item.hash);
	const circleIndex = inputIndex !== -1 ? inputIndex : inputs.length;

	const circleColor =
		circleIndex < outputs.length ? outputs[circleIndex].color :
			circleIndex < inputs.length ? inputs[circleIndex].color :
				DEFAULT_REF_COLOR;

	let outIdx = 0;
	for (let index = 0; index < inputs.length; index++) {
		const color = inputs[index].color || DEFAULT_REF_COLOR;

		if (inputs[index].id === item.hash) {
			// Current commit lane
			if (index !== circleIndex) {
				// draw "/---" into circle lane
				const d = [];
				const path = createPath(color);

				// /
				d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
				d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * index} ${SWIMLANE_WIDTH}`);

				// -
				d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);

				path.setAttribute('d', d.join(' '));
				svg.append(path);
			} else {
				outIdx++;
			}
		} else {
			// Not the current commit lane; carry lanes forward
			if (outIdx < outputs.length && inputs[index].id === outputs[outIdx].id) {
				if (index === outIdx) {
					// straight vertical
					const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
					svg.append(path);
				} else {
					// curve from input to output lane
					const d = [];
					const path = createPath(color);

					// |
					d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
					d.push(`V 6`);

					// curve to middle
					d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${(SWIMLANE_WIDTH * (index + 1)) - SWIMLANE_CURVE_RADIUS} ${SWIMLANE_HEIGHT / 2}`);

					// horizontal
					d.push(`H ${(SWIMLANE_WIDTH * (outIdx + 1)) + SWIMLANE_CURVE_RADIUS}`);

					// curve down
					d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (outIdx + 1)} ${(SWIMLANE_HEIGHT / 2) + SWIMLANE_CURVE_RADIUS}`);

					// |
					d.push(`V ${SWIMLANE_HEIGHT}`);

					path.setAttribute('d', d.join(' '));
					svg.append(path);
				}
				outIdx++;
			}
		}
	}

	// extra parents (merge lines)
	for (let i = 1; i < (item.parents?.length || 0); i++) {
		const parentId = item.parents[i];
		const parentOutIdx = findLastIndex(outputs, parentId);
		if (parentOutIdx === -1) { continue; }

		const d = [];
		const color = outputs[parentOutIdx].color || DEFAULT_REF_COLOR;
		const path = createPath(color);

		// draw "\" arc from parent lane bottom to middle
		d.push(`M ${SWIMLANE_WIDTH * parentOutIdx} ${SWIMLANE_HEIGHT / 2}`);
		d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutIdx + 1)} ${SWIMLANE_HEIGHT}`);

		// draw "-" from parent middle to circle lane center
		d.push(`M ${SWIMLANE_WIDTH * parentOutIdx} ${SWIMLANE_HEIGHT / 2}`);
		d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);

		path.setAttribute('d', d.join(' '));
		svg.append(path);
	}

	// | to *
	if (inputIndex !== -1) {
		svg.append(drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, inputs[inputIndex].color || DEFAULT_REF_COLOR));
	}

	// | from *
	if (item.parents && item.parents.length > 0) {
		svg.append(drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, circleColor));
	}

	// Node symbol
	if (vm.isCurrent) {
		// HEAD – single ring
		svg.append(drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, '#000', circleColor));
	} else if ((item.parents?.length || 0) > 1) {
		// merge commit – double dot
		svg.append(drawCircle(circleIndex, CIRCLE_RADIUS + 1, 1, 'none', circleColor));
		svg.append(drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor, '#000'));
	} else {
		// normal commit – single dot
		svg.append(drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, circleColor, '#000'));
	}

	// set dimensions based on lane count
	const cols = Math.max(inputs.length, outputs.length, 1) + 1;
	svg.style.height = `${SWIMLANE_HEIGHT}px`;
	svg.style.width = `${SWIMLANE_WIDTH * cols}px`;

	return svg;
}

// ---------- UI ----------

window.addEventListener('message', event => {
	const msg = event.data || {};
	switch (msg.type) {
		case 'empty':
			renderEmpty();
			break;
		case 'error':
			renderError(msg.message || 'Unknown error');
			break;
		case 'commits':
			state.repoPath = msg.repoPath || '';
			state.repoName = msg.repoName || '';
			state.commits = Array.isArray(msg.commits) ? msg.commits : [];
			vscode.setState(state);
			renderList(state.commits, state.repoPath);
			break;
	}
});

function renderEmpty() {
	const app = document.getElementById('app');
	app.textContent = '';
	const d = document.createElement('div');
	d.className = 'empty';
	d.textContent = 'No git repositories found';
	app.appendChild(d);
}
function renderError(message) {
	const app = document.getElementById('app');
	app.textContent = '';
	const d = document.createElement('div');
	d.className = 'error';
	d.textContent = `Error: ${message}`;
	app.appendChild(d);
}
function refresh() {
	vscode.postMessage({ command: 'refresh' });
}
function onCommitClick(hash, repoPath) {
	if (!hash) { return; }
	vscode.postMessage({ command: 'commitClicked', commitHash: hash, repoPath });
}

function renderList(commits, repoPath) {
	const app = document.getElementById('app');
	app.textContent = '';

	const list = document.createElement('div');
	list.className = 'commit-list';

	// Build swimlane view models
	// NOTE: historyItems order is already newest->oldest (git log).
	const historyItems = commits.map(c => ({
		id: c.hash,
		hash: c.hash,
		parents: Array.isArray(c.parents) ? c.parents : [],
		subject: c.subject || c.message || '',
		author: c.author || '',
		refs: Array.isArray(c.refs) ? c.refs : []
	}));
	const viewModels = buildViewModels(historyItems);

	for (let i = 0; i < viewModels.length; i++) {
		const vm = viewModels[i];
		const commit = vm.historyItem;

		const row = document.createElement('div');
		row.className = 'commit-row';
		row.addEventListener('click', () => onCommitClick(commit.hash, repoPath));
		row.setAttribute('role', 'listitem');

		const graphCol = document.createElement('div');
		graphCol.className = 'graph-col';
		graphCol.appendChild(renderRowGraph(vm));

		const content = document.createElement('div');
		content.className = 'content';

		const subject = document.createElement('span');
		subject.className = 'subject';
		subject.textContent = commit.subject || commit.hash;
		subject.title = commit.subject || commit.hash;

		const author = document.createElement('span');
		author.className = 'author';
		author.textContent = commit.author ? commit.author : '';
		author.title = commit.author || '';

		content.appendChild(subject);
		if (commit.author) { content.appendChild(author); }

		row.appendChild(graphCol);
		row.appendChild(content);

		list.appendChild(row);
	}

	app.appendChild(list);
}

// Render initial state from cache or show loading
if (state.commits && state.commits.length > 0) {
	renderList(state.commits, state.repoPath);
} else {
	document.getElementById('app').textContent = 'Loading history…';
}