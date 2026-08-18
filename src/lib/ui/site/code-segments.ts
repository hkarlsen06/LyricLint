/** One piece of a sentence, and whether it was written as a quoted form. */
interface CodeSegment {
	code: boolean;
	text: string;
}

/**
 * A sentence split on its backticks, so the forms quoted inside it can be set
 * in the page's own code idiom.
 *
 * Three surfaces write prose that quotes a literal — a lookup table's
 * conditions (`` `cuz` remains valid when it means cousin ``), the guide's
 * statement of each rule family (`` `[Verse 1]` ``), and a guidance entry's own
 * statement and note (`` `gon'` for `gonna` ``) — and rendered raw the reader
 * gets a stray grave accent around the very word the sentence is about. Shared
 * rather than written three times: it was already in the rule page when the
 * guide needed it, and a second copy is the drift `copySectionLinks` exists as
 * one function for.
 *
 * The splitting is here and the *drawing* of it is `CodeProse.svelte`, which is
 * what every one of those three renders — three hand-written copies of the same
 * nested `{#each}` and the same `.site-code` span was the same drift arriving
 * one layer up.
 *
 * Odd segments are the quoted ones, so an unpaired backtick renders as text
 * rather than swallowing the rest of the sentence.
 */
export function codeSegments(text: string): CodeSegment[] {
	return text
		.split('`')
		.map((part, index) => ({ code: index % 2 === 1, text: part }))
		.filter((segment) => segment.text.length > 0);
}
