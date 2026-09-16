import { describe, expect, it } from 'vitest';
import { importDocument } from './import.js';
import { pasteDocument, sliceDocument } from './clipboard.js';
import { renderProfile } from './projection.js';
import { resolveDecision } from './decisions.js';
import type { ConversionDocument, Projection } from './model.js';

function imported(text: string, profile: Projection['profile'] = 'genius') {
	const result = importDocument({ text, profile, language: 'en' });
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}
function rendered(document: ConversionDocument, profile: Projection['profile']) {
	const result = renderProfile(document, profile);
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}
function copied(document: ConversionDocument, projection: Projection, from: number, to: number) {
	const result = sliceDocument(document, projection, { from, to });
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

describe('owned conversion clipboard fragments', () => {
	it('moves quantity facts with their owned copied words', () => {
		const original = imported('Before\nTwenty');
		const confirmed = resolveDecision(original, rendered(original, 'genius'), {
			kind: 'confirmQuantity',
			range: { from: 7, to: 13 },
			facts: {
				profile: 'musixmatch',
				language: 'en',
				value: '20',
				usage: 'ordinary-cardinal',
				pronunciation: 'whole-quantity',
				spokenForm: 'Twenty'
			}
		});
		if (!confirmed.ok) throw new Error(confirmed.refusal.message);
		const projection = rendered(confirmed.value.document, 'musixmatch');
		const fragment = copied(confirmed.value.document, projection, 7, projection.text.length);
		expect(fragment.decisions).toContainEqual(
			expect.objectContaining({ kind: 'quantity', from: 0, to: 6 })
		);
		const target = imported('Local\n');
		const pasted = pasteDocument(
			target,
			rendered(target, 'musixmatch'),
			{ from: 6, to: 6 },
			fragment,
			'musixmatch'
		);
		expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
		if (!pasted.ok) return;
		expect(pasted.value.projection.text).toBe('Local\n20');
		expect(rendered(pasted.value.document, 'genius').text).toBe('Local\nTwenty');
		expect(pasted.value.document.decisions).toContainEqual(
			expect.objectContaining({ kind: 'quantity', from: 6, to: 12 })
		);
	});

	it('carries instrumental facts only with both sections and the same recording', () => {
		const original = imported('[Verse]\nOne\n\n[Chorus]\nTwo');
		original.sections[0]!.type = 'Verse';
		original.sections[1]!.type = 'Chorus';
		const confirmed = resolveDecision(original, rendered(original, 'genius'), {
			kind: 'confirmInstrumentalInterval',
			facts: {
				recordingId: 'test',
				currentRecordingId: 'test',
				startMs: 1000,
				endMs: 20001,
				recordingDurationMs: 40000,
				lyricalContent: 'none-confirmed',
				placement: 'between-tagged-sections',
				beforeSectionId: original.sections[0]!.id,
				afterSectionId: original.sections[1]!.id,
				language: 'en'
			}
		});
		if (!confirmed.ok) throw new Error(confirmed.refusal.message);
		const projection = rendered(confirmed.value.document, 'musixmatch');
		const fragment = copied(confirmed.value.document, projection, 0, projection.text.length);
		expect(fragment.markers).toHaveLength(1);
		const partial = copied(confirmed.value.document, projection, 0, 3);
		expect(partial.markers).toEqual([]);
		expect(partial.decisions).toEqual([]);
		expect(partial.recordingId).toBeUndefined();
		const target = { ...imported(''), recordingId: 'test' };
		const pasted = pasteDocument(
			target,
			rendered(target, 'musixmatch'),
			{ from: 0, to: 0 },
			fragment,
			'musixmatch'
		);
		expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
		if (pasted.ok) expect(pasted.value.projection.text).toBe(projection.text);
		const other = { ...target, recordingId: 'another recording' };
		expect(
			pasteDocument(
				other,
				rendered(other, 'musixmatch'),
				{ from: 0, to: 0 },
				fragment,
				'musixmatch'
			).ok
		).toBe(false);
	});

	it('keeps French-derived spacing when pasted into a different default language', () => {
		const source = importDocument({ text: 'Pourquoi ?', profile: 'genius', language: 'fr' });
		if (!source.ok) throw new Error(source.refusal.message);
		const projection = rendered(source.value, 'musixmatch');
		expect(projection.text).toBe('Pourquoi?');
		const fragment = copied(source.value, projection, 0, projection.text.length);
		const target = imported('');
		const pasted = pasteDocument(
			target,
			rendered(target, 'musixmatch'),
			{ from: 0, to: 0 },
			fragment,
			'musixmatch'
		);
		expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
		if (!pasted.ok) return;
		expect(pasted.value.projection.text).toBe('Pourquoi?');
		expect(rendered(pasted.value.document, 'genius').text).toBe('Pourquoi ?');
		expect(pasted.value.document.defaultLanguage).toBe('en');
		expect(pasted.value.document.languageRanges).toContainEqual(
			expect.objectContaining({ language: 'fr' })
		);
	});

	it('copies one full hidden section and its annotation without leaking the other section', () => {
		const original = imported(
			'[Verse]\nVisible [moon](123)\n\n[Chorus: Private Singer]\nSecret [word](456)'
		);
		const projection = rendered(original, 'musixmatch');
		const upper = projection.text.indexOf('Secret');
		const fragment = copied(original, projection, 0, upper);
		expect(rendered(fragment, 'musixmatch').text).toBe(projection.text.slice(0, upper));
		expect(rendered(fragment, 'genius').text).toBe('[Verse]\nVisible [moon](123)\n\n');
		expect(JSON.stringify(fragment)).not.toContain('Private Singer');
		expect(JSON.stringify(fragment)).not.toContain('456');
		expect(JSON.stringify(fragment)).not.toContain('Secret');
	});

	it('does not carry an annotation or hidden header through a partial selection', () => {
		const original = imported('[Verse: Private Singer]\nA [moonlight](123) shines');
		const projection = rendered(original, 'musixmatch');
		const from = projection.text.indexOf('moon');
		const fragment = copied(original, projection, from, from + 4);
		expect(rendered(fragment, 'genius').text).toBe('moon');
		expect(fragment.sections).toEqual([]);
		expect(fragment.wrappers).toEqual([]);
	});

	it('retains same-profile hidden syntax through a paste and allocates disjoint identities', () => {
		const original = imported('[Verse]\nA [moon](123)');
		const projection = rendered(original, 'musixmatch');
		const fragment = copied(original, projection, 0, projection.text.length);
		const target = imported('[Intro]\nTonight\n\n');
		const destination = rendered(target, 'musixmatch');
		const result = pasteDocument(
			target,
			destination,
			{ from: destination.text.length, to: destination.text.length },
			fragment,
			'musixmatch'
		);
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.projection.text).toBe('Tonight\n\nA moon');
		expect(rendered(result.value.document, 'genius').text).toBe(
			'[Intro]\nTonight\n\n[Verse]\nA [moon](123)'
		);
		expect(new Set(result.value.document.sections.map((section) => section.id)).size).toBe(2);
	});

	it('preserves visible Genius syntax exactly and rejects foreign-profile application', () => {
		const original = imported('[Verse]\nA [moon](123)');
		const projection = rendered(original, 'genius');
		const fragment = copied(original, projection, 0, projection.text.length);
		const target = imported('');
		const pasted = pasteDocument(
			target,
			rendered(target, 'genius'),
			{ from: 0, to: 0 },
			fragment,
			'genius'
		);
		expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
		expect(pasted.ok && pasted.value.projection.text).toBe(projection.text);
		expect(
			pasteDocument(target, rendered(target, 'musixmatch'), { from: 0, to: 0 }, fragment, 'genius')
				.ok
		).toBe(false);
	});

	it('copies no larger spelling when the selection ends inside generated syntax', () => {
		const original = imported('[Verse]\nA moon');
		const projection = rendered(original, 'genius');
		expect(sliceDocument(original, projection, { from: 1, to: 5 }).ok).toBe(false);
	});
});
