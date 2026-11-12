import { describe, expect, it } from 'vitest';
import { importDocument } from './import.js';
import { renderProfile } from './projection.js';
import { parseDocument } from '#lib/core/parser.js';
import { recognizedSectionHeaders, sectionType } from './section-types.js';
import { sampleDraftText } from '#lib/ui/sample-draft.js';

function imported(text: string, language = 'en') {
	const result = importDocument({ text, language, profile: 'genius' });
	if (!result.ok) throw Error(result.refusal.message);
	return result.value;
}

describe('section types from authored headings', () => {
	it.each([
		['Verse 1', 'en', 'Verse'],
		['Chorus', 'en', 'Chorus'],
		['Pre-Chorus 2', 'en', 'PreChorus'],
		['Hook', 'en', 'Hook'],
		['Hook 2', 'de', 'Hook'],
		['Refreng', 'no', 'Chorus'],
		['Strophe 2', 'de', 'Verse'],
		['Chorus', 'fr', 'Chorus'],
		['Bridge', 'und', 'Bridge'],
		['Post-Chorus', 'en', undefined],
		['My quiet return', 'en', undefined],
		['Chorus x2', 'en', undefined]
	])('uses the known meaning of %s in %s', (name, language, expected) => {
		const document = imported(`[${name}: Mira]\nStay beside me`, language);
		expect(sectionType(document.sections[0]!, language)).toBe(expected);
	});

	it('supplies the sample tags without changing stored metadata or either lyric view', () => {
		const document = imported(sampleDraftText);
		const before = structuredClone(document);
		const projection = renderProfile(document, 'musixmatch');
		if (!projection.ok) throw Error(projection.refusal.message);
		expect(projection.value.sections.map((section) => section.type)).toEqual([
			'Verse',
			'Chorus',
			'Verse'
		]);
		expect(renderProfile(document, 'genius')).toMatchObject({
			ok: true,
			value: { text: sampleDraftText }
		});
		expect(document).toEqual(before);
	});

	it('preserves an explicit override and refuses inference from a broken heading', () => {
		const document = imported('[Verse 1]\nOne');
		const section = document.sections[0]!;
		expect(sectionType({ ...section, type: 'Bridge' }, 'en')).toBe('Bridge');
		expect(sectionType({ ...section, headerVisible: false }, 'en')).toBeUndefined();
		expect(sectionType({ ...section, placement: 'unresolved' }, 'en')).toBeUndefined();
	});
});

describe('recognizing Genius formatting', () => {
	it('counts complete headers that name a reviewed song part', () => {
		expect(
			recognizedSectionHeaders(
				parseDocument('[Verse 1: Mira]\nStay\n\n[Chorus]\nGo\n\n[Refreng]\nBli'),
				'no'
			)
		).toBe(3);
	});

	it.each([
		['a bracketed vocal', '[laughs]\nStay'],
		['an unknown lyric', 'Stay [?]\n[?]'],
		['a header left open', '[Chorus\nStay'],
		['plain lyrics', 'Stay beside me (Beside me)']
	])('does not read %s as structure', (_name, text) => {
		expect(recognizedSectionHeaders(parseDocument(text), 'en')).toBe(0);
	});
});
