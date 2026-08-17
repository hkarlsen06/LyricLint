/**
 * One writer per conversation, held for the length of a write cycle.
 *
 * The chat database is shared by every tab on the profile, and a conversation
 * is the one record two tabs can be inside at the same time: the modal on a
 * `/rules/` page and the workbench panel are the same transcript, so two sends
 * interleave a chat's message rows, its `updatedAt`, and — because each request
 * carries the history as that tab last read it — the context the model answers
 * from. The second tab is refused rather than queued, since a question waiting
 * behind somebody else's stream is a question answered against a transcript
 * that has moved under it.
 *
 * Web Locks rather than a stored claim, for the reason `ui/state/tab-guard.ts`
 * documents at length and which this module is a second, narrower instance of:
 * the browser releases on close, crash and navigation, so there is nothing to
 * expire and nothing left behind by a tab that died mid-answer. That module is
 * the pattern's origin; it is not imported, because the editor's assistant may
 * not depend on the shell.
 *
 * **It fails open, in every direction.** No `navigator` (prerender), no
 * `navigator.locks` (Safari before 15.4), or a lock manager that refuses the
 * request: each of those runs the work exactly as it ran before this existed. A
 * lock that could swallow somebody's question would be a worse bug than the
 * interleaving it prevents.
 */

/** Deterministic, so both tabs name the same lock for the same conversation. */
export function chatLockName(chatId: string): string {
	return `lyriclint-chat-${chatId}`;
}

export type ChatLockOutcome<T> = { held: true; value: T } | { held: false };

/** A unique answer for "the probe found it held", so no work's return can spoof it. */
const HELD_ELSEWHERE = Symbol('held-elsewhere');

/**
 * The manager the shipped workbench takes conversations in, or `null` where
 * there is none to take them in.
 *
 * Handed to the state rather than reached for from inside it, and that is the
 * difference between "another tab" and "another state object in this process".
 * Chat ids are unique per database, so only a second tab can collide over one —
 * but an in-process caller that mints its own conversations shares this origin
 * and would collide with itself. The one production wiring passes this; every
 * other construction writes unguarded, which is also what a browser with no Web
 * Locks does.
 */
export function browserChatLocks(): LockManager | null {
	// `navigator` is absent under prerender and `locks` on browsers that predate
	// the API. Both mean the same thing here: no lock.
	if (typeof navigator === 'undefined') return null;
	return navigator.locks ?? null;
}

/**
 * Run `work` while this tab holds the conversation's write lock, or report that
 * another tab has it and run nothing.
 *
 * The request is `ifAvailable`, never blocking: the whole point is an answer
 * the caller can word, and a queued send would land in a transcript the user
 * has since watched change. The lock is given up when `work` settles — resolved
 * or rejected — because the callback's own promise is what holds it, so a
 * stream that fails, times out, or throws cannot leak the conversation.
 */
export async function withChatLock<T>(
	chatId: string,
	locks: LockManager | null,
	work: () => Promise<T>
): Promise<ChatLockOutcome<T>> {
	if (!locks) return { held: true, value: await work() };

	let started = false;
	try {
		const outcome = await locks.request(
			chatLockName(chatId),
			{ ifAvailable: true },
			async (lock) => {
				if (!lock) return HELD_ELSEWHERE;
				started = true;
				return { value: await work() };
			}
		);
		if (outcome === HELD_ELSEWHERE) return { held: false };
		return { held: true, value: outcome.value };
	} catch (error) {
		// A failure inside `work` is the caller's own and keeps its stack; only a
		// lock manager that never ran it fails open into an unguarded run.
		if (started) throw error;
		return { held: true, value: await work() };
	}
}
