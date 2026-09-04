// Decision record: docs/subsystems/drafts.md — read it before changing this file, and update it with any behavior change.

export const RECENT_LANGUAGES_KEY = 'recentLanguages';
export const MAX_RECENT_LANGUAGES = 5;

/** A stored language tag with something in it, as read back from metadata JSON. */
function isFilledString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parse the stored recent-languages JSON into a deduplicated list.
 *
 * Shared by the draft repository and the backup restore path, which previously
 * spelled out the same `JSON.parse`/`isFilledString`/`Set` body twice. Callers
 * bound the length themselves with `MAX_RECENT_LANGUAGES` where they persist.
 */
export function parseRecentLanguages(value: string | undefined): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return [
			...new Set(parsed.flatMap((language) => (isFilledString(language) ? [language.trim()] : [])))
		];
	} catch {
		return [];
	}
}
