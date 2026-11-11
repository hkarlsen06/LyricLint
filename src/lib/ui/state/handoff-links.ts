/**
 * Hand-over links (`/workbench/#open=1.<payload>`), taken out of the address
 * before anything else reads it.
 *
 * A fragment is never sent in a request, but every script on the page can read
 * `location`, and SvelteKit copies the address into `page.url` and from there
 * into `history.state` on the next shallow navigation, where a Back press can
 * replay it. On a page load the inline script in `src/app.html` takes it first,
 * because a deferred script injected at the edge runs before any module here.
 * The client `init` hook collects that and listens for later ones ahead of the
 * router's own `popstate` listener, the one that adopts a fragment-only
 * navigation. A link clicked inside the app is taken at the click, because the
 * router copies a clicked address into `page.url` before either event fires.
 */

declare global {
	interface Window {
		/** Set by the inline script in `src/app.html` and removed on collection. */
		__lyriclintHandoff?: string;
	}
}

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
	const early = window.__lyriclintHandoff;
	delete window.__lyriclintHandoff;
	if (early) pending.push(early);
	take();
	// A fragment-only navigation fires `popstate` before `hashchange`, and the
	// router adopts the address in its `popstate` listener, registered after
	// this one. `hashchange` covers a browser that skips the first.
	addEventListener('popstate', take);
	addEventListener('hashchange', take);
	addEventListener(
		'click',
		(event) => {
			if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}
			// The nearest HTML or SVG `<a>` that links anywhere, as the router finds
			// it, plus an SVG `xlink:href`, which the browser follows on its own.
			const anchor = event
				.composedPath()
				.find(
					(node): node is HTMLAnchorElement | SVGAElement =>
						(node instanceof HTMLAnchorElement || node instanceof SVGAElement) &&
						(node.hasAttribute('href') ||
							(node instanceof SVGAElement &&
								node.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')))
				);
			if (!anchor || anchor.hasAttribute('download')) return;
			const svg = anchor instanceof SVGAElement;
			const target = svg ? anchor.target.baseVal : anchor.target;
			if (target !== '' && target !== '_self') return;
			let url: URL;
			try {
				url = new URL(svg ? anchor.href.baseVal : anchor.href, document.baseURI);
			} catch {
				return;
			}
			if (
				url.origin !== location.origin ||
				url.pathname !== workbenchPath ||
				!url.hash.startsWith('#open=')
			) {
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			// From another page the workbench has to load, and a full load puts the
			// fragment through the inline script instead of the router.
			if (location.pathname !== workbenchPath) location.assign(url.href);
			else if (deliver) deliver(url.hash);
			else pending.push(url.hash);
		},
		{ capture: true }
	);
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
