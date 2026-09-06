/** Accept a link to a Genius page, suitable for storing and opening externally. */
// This is the shared parser for untrusted imported values; it returns a normalized URL,
// so a type predicate cannot express its result.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function normalizeGeniusUrl(value: unknown): string | undefined {
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- Reject non-string input at this parsing boundary before trimming it.
	if (typeof value !== 'string') return undefined;
	try {
		const url = new URL(value.trim());
		if (
			(url.protocol !== 'https:' && url.protocol !== 'http:') ||
			(url.hostname !== 'genius.com' && url.hostname !== 'www.genius.com') ||
			url.username !== '' ||
			url.password !== '' ||
			url.pathname === '/'
		)
			return undefined;
		return url.href;
	} catch {
		return undefined;
	}
}
