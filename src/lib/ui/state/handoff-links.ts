/**
 * Hand-over links (`/workbench/#open=1.<payload>`), taken out of the address
 * before anything else reads it.
 *
 * A fragment is never sent in a request, but every script on the page can read
 * `location`, and SvelteKit copies the address into `page.url` and from there
 * into `history.state` on the next shallow navigation, where a Back press can
 * replay it. So the fragment leaves from the client `init` hook, which runs
 * before the router first reads the address and before the router's own
 * `popstate` listener, the one that adopts a fragment-only navigation.
 */

const pending: string[] = [];
let deliver: ((fragment: string) => void) | undefined;

/** Take hand-over fragments on `workbenchPath`, now and on every later navigation. */
export function captureHandoffLinks(workbenchPath: string): void {
	const take = () => {
		if (location.pathname !== workbenchPath || !location.hash.startsWith('#open=')) return;
		const fragment = location.hash;
		history.replaceState(history.state, '', `${location.pathname}${location.search}`);
		if (deliver) deliver(fragment);
		else pending.push(fragment);
	};
	take();
	// A fragment-only navigation fires `popstate` before `hashchange`, and the
	// router adopts the address in its `popstate` listener, registered after
	// this one. `hashchange` covers a browser that skips the first.
	addEventListener('popstate', take);
	addEventListener('hashchange', take);
}

/**
 * Hand each captured fragment to `listener`, the ones taken before it arrived
 * first. One listener at a time; the returned function removes it.
 */
export function receiveHandoffLinks(listener: (fragment: string) => void): () => void {
	deliver = listener;
	for (const fragment of pending.splice(0)) listener(fragment);
	return () => {
		if (deliver === listener) deliver = undefined;
	};
}
