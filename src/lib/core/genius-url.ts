/** Accept a link to a Genius page, suitable for storing and opening externally. */
export function normalizeGeniusUrl(value: unknown): string | undefined {
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
