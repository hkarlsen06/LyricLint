// Shared rule names have no dependency on reference-page derivation or its corpora.
/**
 * Index group names, keyed by ID prefix. The lookup throws on a prefix it does
 * not know so a rule family cannot ship with its raw prefix as a heading —
 * prerendering every page is part of the build, which makes this a build error
 * rather than a runtime one.
 *
 * It is also what `ruleName` reads, and that is a second set of callers with a
 * second set of prefixes: Harper's findings are not registry rules and have no
 * reference page, but they are diagnostics like any other, so ignoring one
 * names it in the ignored-rules footer. `style` is in this map for that reason
 * alone — `style.harper` has no page and never will, and without an entry here
 * `ruleName` fell through to its own fallback and printed the raw ID at the
 * reader.
 */
const groupTitles = new Map<string, string>([
	['syntax', 'Syntax and markup'],
	['language', 'Language selection'],
	['section', 'Section headers'],
	['performer', 'Performer attribution'],
	['spelling', 'Spelling'],
	['quotes', 'Quotation marks'],
	['contraction', 'Contractions'],
	['grammar', 'Grammar'],
	['style', 'Style'],
	['symbols', 'Symbols and special characters'],
	['text', 'Text spacing and invisible characters'],
	['unknown', 'Unknown lyrics'],
	['repeat', 'Repeated sections'],
	['sound-effect', 'Sound effects'],
	['censored', 'Censored words'],
	['adlib', 'Ad-libs'],
	['capitalization', 'Capitalization'],
	['punctuation', 'Punctuation'],
	['line', 'Line length'],
	['numbers', 'Numbers']
]);

export function groupTitle(prefix: string): string {
	const title = groupTitles.get(prefix);
	if (!title) {
		throw new Error(`No reference group title for rule prefix "${prefix}"`);
	}
	return title;
}

/**
 * What a rule is called in front of a reader. `adlib.parentheses` is a
 * developer's handle, so every surface naming a rule to a user — the
 * ignored-rules footer, the ignore and restore announcements — comes through
 * here.
 *
 * It is the index group's own title plus the rest of the ID in words, rather
 * than the rule's diagnostic message: a message is written about the occurrence
 * in front of the reader (“«definately» is a common English spelling error”),
 * and ignoring a rule silences all of them. Derived rather than hand-written so
 * a new rule cannot ship with no name, and unknown IDs fall back to themselves —
 * a label is not worth breaking a restore over.
 */
export function ruleName(id: string): string {
	const [prefix, ...rest] = id.split('.');
	const detail = rest.join(' ').replaceAll('-', ' ');
	const title = groupTitles.get(prefix);
	if (!title || !detail) return id;
	return `${title}: ${detail}`;
}
