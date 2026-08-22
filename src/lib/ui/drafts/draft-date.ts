/**
 * When a draft was last touched, written the way a list is read.
 *
 * `25.7.2026` is a machine's answer: every row carries the same eight
 * characters and the reader has to parse all of them to learn that the draft is
 * from today. The named recent days answer the question the list is actually
 * asked — which of these did I have open — and the numeric form only appears
 * once the answer stops being "recently". The year is dropped inside the
 * current one, where it is the same on every row.
 *
 * The exact timestamp stays on the row's `datetime` and tooltip, so nothing is
 * lost by shortening what is drawn.
 */
export function formatDraftDate(iso: string, now: Date = new Date()): string {
	const updated = new Date(iso);
	if (Number.isNaN(updated.getTime())) return '';

	const days = daysBetween(updated, now);
	if (days === 0) return 'Today';
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days} days ago`;

	// English, like the rest of the application's own words: the browser locale
	// put a Norwegian month on the same line as "Yesterday" one row above it.
	// The document's language is about the lyrics, not about the chrome.
	const format: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
	if (updated.getFullYear() !== now.getFullYear()) format.year = 'numeric';
	return updated.toLocaleDateString('en-GB', format);
}

/** Whole calendar days from `updated` to `now`, in local time. */
function daysBetween(updated: Date, now: Date): number {
	const startOfUpdated = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate());
	const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return Math.round((startOfNow.getTime() - startOfUpdated.getTime()) / 86_400_000);
}

/** The full local timestamp, for the tooltip behind the short form. */
export function fullDraftDate(iso: string): string {
	const updated = new Date(iso);
	return Number.isNaN(updated.getTime()) ? '' : updated.toLocaleString();
}
