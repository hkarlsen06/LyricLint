import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workbenchSettled } from './workbench-observer.mjs';
import { summarizeWorkbenchProfile } from './workbench-profiler.mjs';

function rendered() {
	return {
		now: 1000,
		operation: {
			expectedText: 'current lyrics',
			projectedText: 'current lyrics',
			startedAt: 100,
			nativeOffset: 20,
			harperOffset: 40
		},
		nativePending: 'false',
		completedLint: { receivedAt: 800, responseType: 'Array', text: 'current lyrics' },
		pending: 0,
		keys: ['spelling.english-common:20:29', 'spelling.harper:40:47'],
		paintAfterLintAt: 850,
		lastDiagnosticMutationAt: 870,
		errors: []
	};
}

test('requires both current diagnostic sources, the real worker answer and a painted quiet DOM', () => {
	assert.equal(workbenchSettled(rendered()), true);
	for (const change of [
		{ completedLint: undefined },
		{ completedLint: { receivedAt: 800, responseType: 'Array', text: 'previous lyrics' } },
		{ completedLint: { receivedAt: 800, responseType: 'undefined' } },
		{ pending: 1 },
		{ nativePending: 'true' },
		{ keys: ['spelling.english-common:20:29'] },
		{ keys: ['spelling.english-common:20:29', 'spelling.harper:16:23'] },
		{ paintAfterLintAt: 790 },
		{ lastDiagnosticMutationAt: 950 },
		{ operation: { ...rendered().operation, startedAt: undefined } }
	])
		assert.equal(workbenchSettled({ ...rendered(), ...change }), false, JSON.stringify(change));
});

test('worker errors invalidate the measurement rather than produce a fast success', () => {
	assert.throws(
		() => workbenchSettled({ ...rendered(), errors: ['WASM initialization failed'] }),
		/WASM initialization failed/
	);
});

test('reports sampled self CPU separately from idle and unattributed time', () => {
	const result = summarizeWorkbenchProfile({
		nodes: [
			{ id: 1, callFrame: { functionName: '(idle)', url: '', lineNumber: -1 } },
			{ id: 2, callFrame: { functionName: 'lint', url: 'worker.js', lineNumber: 4 } },
			{ id: 3, callFrame: { functionName: '(program)', url: '', lineNumber: -1 } }
		],
		samples: [1, 2, 3, 2],
		timeDeltas: [100_000, 2000, 5000, 3000]
	});
	assert.equal(result.sampledActiveMs, 5);
	assert.deepEqual(result.topSelfCpu, [
		{ name: 'lint', url: 'worker.js', line: 5, sampledSelfMs: 5 }
	]);
});
