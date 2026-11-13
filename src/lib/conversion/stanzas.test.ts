import { describe, expect, it } from 'vitest';
import { importDocument, renderProfile, resolveDecision } from './index.js';
import { stanzaOutline, stanzaStartAt, taggedSections } from './stanzas.js';

const lyrics = [
	'Back down the block',
	'Counting every light',
	'',
	'Hold the line',
	'Hold the line',
	'',
	'Morning through the glass',
	'',
	'hold  the line',
	'Hold the LINE'
].join('\n');

function outline(text: string, tags: readonly [number, 'Verse' | 'Chorus'][]) {
	const imported = importDocument({ text, language: 'en', profile: 'musixmatch' });
	if (!imported.ok) throw Error(imported.refusal.message);
	let document = imported.value;
	for (const [at, type] of tags) {
		const projection = renderProfile(document, 'musixmatch');
		if (!projection.ok) throw Error(projection.refusal.message);
		const result = resolveDecision(document, projection.value, {
			kind: 'insertSection',
			at,
			type
		});
		if (!result.ok) throw Error(result.refusal.message);
		document = result.value.document;
	}
	const projection = renderProfile(document, 'musixmatch');
	if (!projection.ok) throw Error(projection.refusal.message);
	return stanzaOutline(projection.value.text, taggedSections(document, projection.value));
}

describe('the stanza outline of a headerless draft', () => {
	it('lists each stanza with its first line and extent', () => {
		expect(
			outline(lyrics, []).map(({ line, lineCount, opening }) => [line, lineCount, opening])
		).toEqual([
			[1, 2, 'Back down the block'],
			[4, 2, 'Hold the line'],
			[7, 1, 'Morning through the glass'],
			[9, 2, 'hold  the line']
		]);
	});

	it('marks the stanza a section begins on and the stanzas that continue it', () => {
		const rows = outline(lyrics, [[0, 'Verse']]);
		expect(rows[0]!.section?.type).toBe('Verse');
		expect(rows.slice(1).map((row) => [row.section, row.continues?.type])).toEqual([
			[undefined, 'Verse'],
			[undefined, 'Verse'],
			[undefined, 'Verse']
		]);
	});

	it('suggests the tag of an identically worded stanza, ignoring case and spacing', () => {
		const rows = outline(lyrics, [
			[0, 'Verse'],
			[lyrics.indexOf('Hold the line'), 'Chorus']
		]);
		expect(rows.map((row) => row.suggestion)).toEqual([undefined, undefined, undefined, 'Chorus']);
	});

	it('gives a boundary inside a stanza its own row', () => {
		const text = 'One\nTwo\nThree';
		const rows = outline(text, [
			[0, 'Verse'],
			[text.indexOf('Two'), 'Chorus']
		]);
		expect(rows.map((row) => [row.line, row.lineCount, row.section?.type])).toEqual([
			[1, 1, 'Verse'],
			[2, 2, 'Chorus']
		]);
	});
});

describe('where a stanza tag belongs', () => {
	it.each([
		['the first line', 0, 0],
		['a later line of the stanza', lyrics.indexOf('Counting') + 3, 0],
		['the end of a stanza', lyrics.indexOf('\n\nMorning'), lyrics.indexOf('Hold the line')],
		['a blank line, which reads forward', lyrics.indexOf('\nMorning'), lyrics.indexOf('Morning')]
	])('is the stanza start from %s', (_, offset, expected) => {
		expect(stanzaStartAt(lyrics, offset)).toBe(expected);
	});

	it('is the section the caret line belongs to when a boundary splits the stanza', () => {
		const text = 'One\nTwo\nThree';
		const boundary = { id: 'b', at: text.indexOf('Two'), name: 'Chorus', removable: true };
		expect(stanzaStartAt(text, text.indexOf('Three'), [boundary])).toBe(boundary.at);
		expect(stanzaStartAt(text, 1, [boundary])).toBe(0);
	});

	it('is the caret line when nothing follows, so an empty draft can be tagged', () => {
		expect(stanzaStartAt('', 0)).toBe(0);
		expect(stanzaStartAt('One\n\n', 5)).toBe(5);
	});
});
