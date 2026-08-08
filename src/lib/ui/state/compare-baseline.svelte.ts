import { SvelteMap } from 'svelte/reactivity';

/*
 * The Compare dialog's baseline: the page's lyrics as the user pasted them
 * into that dialog, held for the length of the session and deliberately never
 * written to the draft.
 *
 * Not persisting it is the design, not a shortcut. The comparison that matters
 * is against the page as it stands at update time, and a baseline remembered
 * across sessions is how the dialog comes to attribute somebody else's
 * month-old edits to this user — a diff against a stale baseline is worse than
 * no diff. A reload asks again, which is what guarantees the answer is fresh;
 * within a session the paste is reused, because nothing has had time to move.
 *
 * Nothing pasted into the *editor* ever reaches this map. A paste is one
 * gesture with two possible meanings, and no heuristic can tell "here is my
 * working text" from "here is the page's version" — so the meaning is carried
 * by the destination instead: only the dialog's own paste area writes here.
 *
 * Module state rather than controller state, keyed by draft so switching
 * 'scribes cannot show one song's baseline under another's diff. Like every
 * module-state store here, a component test has to reset it or it inherits
 * whatever the test above it pasted.
 */

const baselines = new SvelteMap<string, string>();

/** The baseline pasted for this draft this session, if any. */
export function compareBaseline(draftId: string): string | undefined {
	return baselines.get(draftId);
}

export function setCompareBaseline(draftId: string, text: string): void {
	baselines.set(draftId, text);
}

/** For tests: module state survives between renders unless somebody clears it. */
export function resetCompareBaselines(): void {
	baselines.clear();
}
