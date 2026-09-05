import { referenceSearchTokens as queryTokens } from '$lib/reference/search.js';
import {
	emptyReferenceSearch,
	referenceSearchHref,
	type ReferenceSearchState
} from './reference-url.js';

// Only browser interactions write this state. Prerendering always starts with the neutral directory.
let state = $state<ReferenceSearchState>(emptyReferenceSearch());
let writeUrl: ((state: ReferenceSearchState) => void) | undefined;

export function referenceSearchState(): ReferenceSearchState {
	return state;
}

export function setReferenceSearchState(patch: Partial<ReferenceSearchState>): void {
	state = { ...state, ...patch };
	writeUrl?.(state);
}

export function restoreReferenceSearchState(next: ReferenceSearchState): void {
	state = next;
}
export function resetReferenceSearchState(): void {
	setReferenceSearchState(emptyReferenceSearch());
}

export function connectReferenceSearchUrl(
	writer: (state: ReferenceSearchState) => void
): () => void {
	writeUrl = writer;
	return () => {
		if (writeUrl === writer) writeUrl = undefined;
	};
}

export function referenceHref(href: string): string {
	return referenceSearchHref(href, state);
}
export function referenceSearchQuery(): string {
	return state.query;
}
export function setReferenceSearchQuery(query: string): void {
	setReferenceSearchState({ query });
}
const tokens = $derived(queryTokens(state.query));
export function referenceSearchTokens(): readonly string[] {
	return tokens;
}
