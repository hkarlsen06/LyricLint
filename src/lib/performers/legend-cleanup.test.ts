import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { TextEdit } from '$lib/core/types.js';
import { cleanupLegendSlots } from './legend-cleanup.js';

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let result = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
	}
	return result;
}

function cleaned(text: string): string {
	return applyEdits(text, cleanupLegendSlots(parseDocument(text)));
}

describe('cleanupLegendSlots', () => {
	const fullLegend = '[Vers 1: ben james, <i>Leif tore</i> & <b>ben james & Leif tore</b>]';

	it('drops only the <b> group when every bold span is gone from the body', () => {
		const text = `${fullLegend}\nben james sings this line\n<i>a quiet reply</i>`;
		expect(cleaned(text)).toBe(
			'[Vers 1: ben james, <i>Leif tore</i>]\nben james sings this line\n<i>a quiet reply</i>'
		);
	});

	it('drops only the <i> group when every italic span is gone from the body', () => {
		const text = `${fullLegend}\nben james sings this line\n<b>together now</b>`;
		expect(cleaned(text)).toBe(
			'[Vers 1: ben james & <b>ben james & Leif tore</b>]\nben james sings this line\n<b>together now</b>'
		);
	});

	it('drops down to the single plain performer when styled spans disappear', () => {
		const text = `${fullLegend}\nben james sings this line`;
		expect(cleaned(text)).toBe('[Vers 1: ben james]\nben james sings this line');
	});

	it('collapses to the bare header when every legend slot is unused', () => {
		const text = '[Vers 1: <i>Leif tore</i> & <b>duo</b>]\nplain line with no styling';
		expect(cleaned(text)).toBe('[Vers 1]\nplain line with no styling');
	});

	it('does not drop slots that still occur in the body', () => {
		const text = `${fullLegend}\nben james sings\n<i>echo</i>\n<b>both of them</b>`;
		expect(cleanupLegendSlots(parseDocument(text))).toEqual([]);
	});

	it('keeps the plain group while any plain lyric line remains', () => {
		const text = '[Chorus: Avery, <i>Blair</i>]\nAvery holds the melody';
		expect(cleaned(text)).toBe('[Chorus: Avery]\nAvery holds the melody');
	});

	it('never prunes a header whose body is still empty', () => {
		const text = '[Verse 1: Mara, <i>Jun</i>]\n';
		expect(cleanupLegendSlots(parseDocument(text))).toEqual([]);
	});

	it('never touches sections containing malformed or unsupported markup', () => {
		const malformed = '[Verse: Mara, <i>Jun</i>]\nplain text\n<i>unclosed span';
		expect(cleanupLegendSlots(parseDocument(malformed))).toEqual([]);

		const unsupported = '[Verse: Mara, <i>Jun</i>]\nplain text\n<em>other markup</em>';
		expect(cleanupLegendSlots(parseDocument(unsupported))).toEqual([]);
	});

	it('never touches an unclosed header', () => {
		const text = '[Verse: Mara, <i>Jun</i>\nplain text';
		expect(cleanupLegendSlots(parseDocument(text))).toEqual([]);
	});

	it('is a fixpoint: applying its edits yields no further edits', () => {
		const text = `${fullLegend}\nben james sings this line`;
		const once = cleaned(text);
		expect(cleanupLegendSlots(parseDocument(once))).toEqual([]);
	});

	it('cleans several sections independently in one pass', () => {
		const text = [
			'[Verse 1: Mara, <i>Jun</i>]',
			'Mara sings alone here',
			'',
			'[Chorus: Mara, <i>Jun</i>]',
			'Shared plain line',
			'<i>Jun answers</i>'
		].join('\n');
		expect(cleaned(text)).toBe(
			[
				'[Verse 1: Mara]',
				'Mara sings alone here',
				'',
				'[Chorus: Mara, <i>Jun</i>]',
				'Shared plain line',
				'<i>Jun answers</i>'
			].join('\n')
		);
	});
});
