/**
 * The href a citation may be followed to, or nothing when its URL is not a web
 * address. Every surface that renders provenance goes through this, so a rule
 * pack can never smuggle a `javascript:` link into a link the user can click.
 */
export function safeExternalUrl(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
	} catch {
		return undefined;
	}
}
