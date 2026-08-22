/**
 * One workbench per browser profile, held by whichever tab opened it first.
 *
 * Two tabs on one profile are two independent debounced autosaves writing whole
 * records into the same database, so the last write wins and neither tab knows
 * the other exists. The tab that loses is not the one being typed in: an idle
 * tab flushes on the way to hidden, and that flush carries the text as it stood
 * when that tab last read it — an afternoon of edits made in the other tab,
 * overwritten by a copy the user had stopped looking at. The session-scoped
 * ignore mirror and the assistant's stored conversation are written the same
 * way and lose the same way.
 *
 * The guard is a lock rather than cross-tab sync, because the two answers are
 * not the same size. Sync means reconciling two live editor sessions, two
 * histories and two autosave controllers against a record that has moved under
 * both; a lock means the second tab does not start.
 *
 * **Web Locks rather than a `localStorage` heartbeat**, and that is the whole
 * reason this module is short. The browser releases the lock when the tab is
 * closed, crashed, or navigated away, so there is no claim to expire, no
 * interval to tune, and no state left behind by a tab that died — which is the
 * failure every heartbeat scheme eventually ships, as a workbench that refuses
 * to open because a tab crashed yesterday.
 *
 * **It fails open, in every direction.** A browser with no `navigator.locks`
 * (Safari before 15.4), a lock manager that throws, a prerender with no
 * `navigator` at all: each of those resolves `held` at once and the workbench
 * boots exactly as it did before this existed. A guard that could keep the
 * workbench off the screen would be a worse bug than the one it prevents.
 */

import { browser } from '$app/environment';

/**
 * One lock for the workbench, never one per 'scribe.
 *
 * A per-'scribe lock would be the finer answer to the autosave hazard alone and
 * the wrong answer to the rest: the ignore mirror, the assistant's conversation
 * and the current-'scribe pointer are all workspace-wide, and a tab that may
 * open a second 'scribe at any moment has no stable claim to make.
 */
export const WORKBENCH_LOCK_NAME = 'lyriclint-workbench';

interface TabGuardOptions {
	/**
	 * The lock manager to hold the workbench in. Injectable so the guard can be
	 * driven by a stub — a real `LockManager` cannot be made to say "held
	 * elsewhere" from inside one page — and defaulting to the browser's own.
	 * Passing `null` turns the guard off, which is what a missing API resolves
	 * to.
	 */
	locks?: LockManager | null;
	/** Overridable for tests, so one run's locks cannot outlive its test. */
	name?: string;
	/**
	 * Called once, and only where another tab already holds the workbench. This
	 * is what draws the notice; nothing is called on the ordinary path, so a
	 * first tab pays no UI for the guard at all.
	 */
	onWaiting?: () => void;
}

export interface TabGuard {
	/**
	 * Resolves once this tab holds the workbench. Never rejects — see the module
	 * note on failing open.
	 */
	readonly held: Promise<void>;
	/** Give the workbench up. Idempotent, and safe before the lock is granted. */
	release(): void;
}

/** A unique answer for "the probe found it held", so no callback return can spoof it. */
const HELD_ELSEWHERE = Symbol('held-elsewhere');

function browserLocks(): LockManager | null {
	// There is no `navigator` under prerender and no `locks` on browsers that
	// predate the API. Both mean the same thing here: no guard.
	if (!browser) return null;
	return navigator.locks ?? null;
}

/**
 * Take the workbench for this tab, or wait for the tab that has it.
 *
 * The probe comes first (`ifAvailable`), so the ordinary case — no other tab —
 * costs one already-resolved round trip and draws nothing. Only where the probe
 * comes back empty is a *blocking* request issued, and that one settles when the
 * holding tab closes, which is what makes this page take over on its own rather
 * than asking the user to reload.
 */
export function guardWorkbenchTab(options: TabGuardOptions = {}): TabGuard {
	const name = options.name ?? WORKBENCH_LOCK_NAME;
	const locks = options.locks === undefined ? browserLocks() : options.locks;

	if (!locks) return { held: Promise.resolve(), release() {} };

	let signalHeld: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		signalHeld = resolve;
	});

	let letGo: (() => void) | undefined;
	let released = false;
	// Aborting is how a pending *wait* is abandoned; the hold itself ends by
	// resolving its own promise, which is what a granted lock's callback returns.
	const abort = 'AbortController' in globalThis ? new AbortController() : undefined;

	// The lock is held for the life of the tab, so the callback returns a promise
	// that only settles when `release` is called.
	const hold = (): Promise<void> => {
		if (released) return Promise.resolve();
		signalHeld();
		return new Promise<void>((resolve) => {
			letGo = resolve;
		});
	};

	const release = (): void => {
		if (released) return;
		released = true;
		letGo?.();
		abort?.abort();
		if (browser) window.removeEventListener('pagehide', onPageHide);
	};

	/**
	 * Hand the lock back as this document goes away, rather than leaving it to
	 * the browser's own release on destruction.
	 *
	 * A reload is this tab racing itself: the new document probes while the old
	 * one may still be holding, and losing that race would flash the notice on an
	 * ordinary refresh. Releasing here is ordered against the navigation by the
	 * document's own lifecycle. A page kept for the back/forward cache
	 * (`persisted`) is not going away and keeps its claim.
	 *
	 * This does not undercut the ordered release the workbench makes after its
	 * final flush. That one governs a client-side navigation, where nothing
	 * unloads and `pagehide` never fires; here the document is being destroyed
	 * within moments either way, and the browser's own release would land in the
	 * same instant.
	 */
	function onPageHide(event: PageTransitionEvent): void {
		if (!event.persisted) release();
	}

	if (browser) window.addEventListener('pagehide', onPageHide);

	void (async () => {
		try {
			const probe = await locks.request(name, { ifAvailable: true }, (lock) =>
				lock ? hold() : HELD_ELSEWHERE
			);
			// Anything but the sentinel means this tab was granted the lock and has
			// since let it go, so there is nothing left to wait for.
			if (probe !== HELD_ELSEWHERE) return;

			options.onWaiting?.();
			if (released) return;
			await locks.request(name, { signal: abort?.signal }, () => hold());
		} catch {
			// A refused lock manager is not a reason to keep the workbench off the
			// screen, so it fails open like a missing one. A guard that has been
			// released is the other way this is reached — teardown's own abort — and
			// there `held` has to stay unsettled: a tab that gave the workbench up
			// must never go on to report that it has it.
			if (!released) signalHeld();
		}
	})();

	return { held, release };
}
