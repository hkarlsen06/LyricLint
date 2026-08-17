import { describe, expect, it, vi } from 'vitest';

import { WORKBENCH_LOCK_NAME, guardWorkbenchTab } from './tab-guard.js';

/**
 * A `LockManager` that can be told another tab is holding the lock.
 *
 * The real one cannot: every page in a test process is the same profile, so a
 * genuine "held elsewhere" needs a second browser context and the guard's whole
 * decision would be untestable. The stub records every request in order, which
 * is what pins the one sequencing rule that matters — the blocking request is
 * only ever issued after the probe has come back empty.
 */
function stubLocks({ heldElsewhere = false } = {}) {
	const requests: Array<{ name: string; ifAvailable: boolean; aborted: boolean }> = [];
	const waiting: Array<{ take: () => void; drop: () => void }> = [];
	let occupied = heldElsewhere;

	const manager = {
		async request(name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) {
			const record = { name, ifAvailable: options.ifAvailable === true, aborted: false };
			requests.push(record);

			const grantNow = () => {
				occupied = true;
				return callback({ name, mode: options.mode ?? 'exclusive' });
			};

			if (options.ifAvailable) return occupied ? callback(null) : grantNow();
			if (!occupied) return grantNow();

			return new Promise((resolve, reject) => {
				const entry = {
					take: () => resolve(grantNow()),
					drop: () => {
						record.aborted = true;
						reject(new Error('AbortError'));
					}
				};
				waiting.push(entry);
				options.signal?.addEventListener('abort', () => {
					const index = waiting.indexOf(entry);
					if (index >= 0) waiting.splice(index, 1);
					entry.drop();
				});
			});
		}
	};

	return {
		locks: manager as unknown as LockManager,
		requests,
		/** The other tab closing: whoever is waiting gets the lock. */
		grant() {
			occupied = false;
			waiting.shift()?.take();
		}
	};
}

/** One macrotask, which is long enough for every await chain the guard has. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function watch(promise: Promise<void>) {
	const state = { settled: false };
	void promise.then(() => (state.settled = true));
	return state;
}

describe('the workbench tab guard', () => {
	it('boots at once and draws nothing where the lock is free', async () => {
		const { locks, requests } = stubLocks();
		const onWaiting = vi.fn();

		const guard = guardWorkbenchTab({ locks, name: 'test-lock', onWaiting });
		await guard.held;

		// One request, and it is the probe: the ordinary path never blocks on
		// anything, so a first tab pays no latency for the guard.
		expect(requests).toEqual([{ name: 'test-lock', ifAvailable: true, aborted: false }]);
		expect(onWaiting).not.toHaveBeenCalled();
		guard.release();
	});

	it('reports the wait, then takes the workbench when the holding tab lets go', async () => {
		const { locks, requests, grant } = stubLocks({ heldElsewhere: true });
		// Read inside the callback, because the point is not that both requests
		// exist but that the probe's answer is what caused the second one.
		let requestsWhenTold = -1;

		const guard = guardWorkbenchTab({
			locks,
			name: 'test-lock',
			onWaiting: () => (requestsWhenTold = requests.length)
		});
		const held = watch(guard.held);
		await settle();

		expect(requestsWhenTold).toBe(1);
		expect(requests.map((request) => request.ifAvailable)).toEqual([true, false]);
		expect(held.settled).toBe(false);

		grant();
		await settle();

		expect(held.settled).toBe(true);
		guard.release();
	});

	it('fails open where the browser has no lock manager', async () => {
		const onWaiting = vi.fn();

		const guard = guardWorkbenchTab({ locks: null, onWaiting });
		await guard.held;

		// Nothing to wait for and nothing to say: an old Safari opens the workbench
		// exactly as it did before the guard existed.
		expect(onWaiting).not.toHaveBeenCalled();
		expect(() => guard.release()).not.toThrow();
	});

	it('abandons the wait when the tab is torn down before the lock arrives', async () => {
		const { locks, requests, grant } = stubLocks({ heldElsewhere: true });

		const guard = guardWorkbenchTab({ locks, name: 'test-lock' });
		const held = watch(guard.held);
		await settle();

		guard.release();
		await settle();
		grant();
		await settle();

		// The abandoned request is aborted rather than left queued, and a released
		// guard never reports that it holds the workbench.
		expect(requests[1]?.aborted).toBe(true);
		expect(held.settled).toBe(false);
	});

	it('names one lock for the whole workbench', () => {
		// Per-'scribe locks are deliberately not the model: the ignore mirror, the
		// assistant's conversation and the current-'scribe pointer are all
		// workspace-wide.
		expect(WORKBENCH_LOCK_NAME).toBe('lyriclint-workbench');
	});
});
