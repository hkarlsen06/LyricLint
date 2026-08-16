/**
 * The fragment as an entry id, for the two surfaces that read one: the guidance
 * catalog's index column and the topic page beside it.
 *
 * `decodeURIComponent` throws a `URIError` on a percent sign that opens no
 * escape — `#%`, or the `#%C3` a chat app leaves after clipping a shared link
 * to a non-ASCII anchor — and both call sites read the hash from inside a Svelte
 * effect, where a throw takes the component down. That lands on exactly the
 * audience deep links exist for, so an anchor that cannot be decoded is the
 * anchor as written: it matches no entry, which is the same answer as no
 * fragment at all, and nothing else on the page is lost with it.
 */
export function safeDecodeHash(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
