import { expect, it } from 'vitest';
import {
	importDocument,
	renderProfile,
	resolveDecision,
	validateModel,
	type EngineResult
} from './index.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

it.each([
	'[Verse: Mira]\nMoon and sun',
	'The [silver compass](123456)',
	'[Verse: Mira]\nThe [silver 🌙 compass](123456) by the door\n[Chorus]\nNext English line',
	'Plain\nmultiline'
])('assigns selected sung content while retaining syntax: %s', (text) => {
	const model = value(importDocument({ text, profile: 'genius', language: 'en' }));
	const before = JSON.stringify(model);
	const projection = value(renderProfile(model, 'genius'));
	const other = value(renderProfile(model, 'musixmatch')).text;
	const result = value(
		resolveDecision(model, projection, {
			kind: 'setPassageLanguage',
			range: { from: 0, to: text.length },
			language: 'fr'
		})
	);
	expect(result.projection.text).toBe(text);
	expect(value(renderProfile(result.document, 'musixmatch')).text).toBe(other);
	expect(result.document.languageRanges).toMatchObject([
		{ from: 0, to: model.content.length, language: 'fr' }
	]);
	for (const key of [
		'sections',
		'wrappers',
		'voices',
		'owners',
		'content',
		'defaultLanguage'
	] as const)
		expect(result.document[key]).toEqual(model[key]);
	expect(validateModel(result.document).ok).toBe(true);
	expect(JSON.stringify(model)).toBe(before);
});

it('maps partial wrapper boundaries and replaces explicit ownership without overlap', () => {
	const text = '🌙 The [silver compass](123456) by the door';
	const model = value(importDocument({ text, profile: 'genius', language: 'en' }));
	const projection = value(renderProfile(model, 'genius'));
	const first = value(
		resolveDecision(model, projection, {
			kind: 'setPassageLanguage',
			range: { from: 0, to: text.length },
			language: 'de'
		})
	);
	const next = value(
		resolveDecision(first.document, first.projection, {
			kind: 'setPassageLanguage',
			range: { from: text.indexOf('['), to: text.indexOf('123') + 1 },
			language: 'fr'
		})
	);
	expect(
		next.document.languageRanges.map(({ from, to, language }) => ({ from, to, language }))
	).toEqual([
		{ from: 0, to: 7, language: 'de' },
		{ from: 7, to: 21, language: 'fr' },
		{ from: 21, to: model.content.length, language: 'de' }
	]);
	expect(next.projection.text).toBe(text);
	expect(validateModel(next.document).ok).toBe(true);
});

it('refuses syntax-only, whitespace, invalid ranges and codes without mutation', () => {
	const text = '[Verse: Mira]\nThe [silver compass](123456)\n  ';
	const model = value(importDocument({ text, profile: 'genius' }));
	const projection = value(renderProfile(model, 'genius'));
	const before = JSON.stringify(model);
	for (const range of [
		{ from: 0, to: text.indexOf('The') },
		{ from: text.indexOf('[', 1), to: text.indexOf('[', 1) + 1 },
		{ from: text.indexOf(']('), to: text.indexOf(')') + 1 },
		{ from: text.length - 2, to: text.length },
		{ from: -1, to: 4 },
		{ from: 0.5, to: 4 },
		{ from: 0, to: text.length + 1 },
		{ from: 2, to: 2 }
	])
		expect(
			resolveDecision(model, projection, { kind: 'setPassageLanguage', range, language: 'fr' }).ok
		).toBe(false);
	expect(
		resolveDecision(model, projection, {
			kind: 'setPassageLanguage',
			range: { from: 0, to: text.length },
			language: 'bad code'
		}).ok
	).toBe(false);
	for (const kind of ['attachAnnotation', 'setForm'] as const) {
		const range = { from: 0, to: text.length };
		expect(
			resolveDecision(
				model,
				projection,
				kind === 'attachAnnotation'
					? { kind, range, annotationId: '456' }
					: { kind, range, profile: 'genius', text: 'replacement' }
			).ok
		).toBe(false);
	}
	expect(JSON.stringify(model)).toBe(before);
});

it.each(['genius', 'musixmatch'] as const)(
	'preserves derived and owned spellings in %s',
	(profile) => {
		const model = value(
			importDocument({
				text: '[Couplet]\nQui ?\n🌙 [Là ?](123456)',
				profile: 'genius',
				language: 'fr'
			})
		);
		const projection = value(renderProfile(model, profile));
		const result = value(
			resolveDecision(model, projection, {
				kind: 'setPassageLanguage',
				range: { from: 0, to: projection.text.length },
				language: 'ja'
			})
		);
		expect(result.projection.text).toBe(projection.text);
		expect(result.document.defaultLanguage).toBe('fr');
		// Musixmatch omits the two French formatting spaces; their source ownership stays French.
		expect(result.document.languageRanges).toMatchObject(
			profile === 'genius'
				? [{ from: 0, to: model.content.length, language: 'ja' }]
				: [
						{ from: 0, to: 3, language: 'ja' },
						{ from: 4, to: 11, language: 'ja' },
						{ from: 12, to: 13, language: 'ja' }
					]
		);
		expect(value(renderProfile(result.document, 'genius')).text).toBe(
			'[Couplet]\nQui ?\n🌙 [Là ?](123456)'
		);
		expect(validateModel(result.document).ok).toBe(true);
	}
);

it('keeps partial transformed wording and stale projection refusals strict', () => {
	const model = value(importDocument({ text: '[Verse]\nMoon', profile: 'genius', language: 'en' }));
	const formed = value(
		resolveDecision(model, value(renderProfile(model, 'musixmatch')), {
			kind: 'setForm',
			range: { from: 0, to: 4 },
			profile: 'musixmatch',
			text: 'Lune brillante'
		})
	);
	expect(
		resolveDecision(formed.document, formed.projection, {
			kind: 'setPassageLanguage',
			range: { from: 1, to: 5 },
			language: 'fr'
		}).ok
	).toBe(false);
	expect(
		resolveDecision(
			model,
			{ ...value(renderProfile(model, 'genius')), text: 'stale' },
			{
				kind: 'setPassageLanguage',
				range: { from: 0, to: 4 },
				language: 'fr'
			}
		).ok
	).toBe(false);
});

it('refuses a generated header adjacent to a hidden owned wording', () => {
	const model = value(importDocument({ text: '[Verse]\nMoon', profile: 'genius' }));
	const hidden = value(
		resolveDecision(model, value(renderProfile(model, 'musixmatch')), {
			kind: 'setForm',
			range: { from: 0, to: 4 },
			profile: 'genius',
			text: ''
		})
	);
	const projection = value(renderProfile(hidden.document, 'genius'));
	expect(projection.text).toBe('[Verse]\n');
	expect(
		resolveDecision(hidden.document, projection, {
			kind: 'setPassageLanguage',
			range: { from: 0, to: projection.text.length },
			language: 'fr'
		}).ok
	).toBe(false);
	expect(hidden.document.languageRanges).toEqual([]);
});

it.each([
	[0, 4],
	[5, 9],
	[10, 13]
])('preserves hidden language ownership at %i..%i inside a visible selection', (from, to) => {
	const source = value(importDocument({ text: '[Verse]\nMoon Star Sun', profile: 'genius' }));
	const tagged = value(
		resolveDecision(source, value(renderProfile(source, 'musixmatch')), {
			kind: 'setPassageLanguage',
			range: { from, to },
			language: 'de'
		})
	);
	const hidden = value(
		resolveDecision(tagged.document, tagged.projection, {
			kind: 'setForm',
			range: { from, to },
			profile: 'genius',
			text: ''
		})
	);
	const projection = value(renderProfile(hidden.document, 'genius'));
	const before = JSON.stringify(hidden.document);
	for (const start of [0, '[Verse]\n'.length]) {
		const result = value(
			resolveDecision(hidden.document, projection, {
				kind: 'setPassageLanguage',
				range: { from: start, to: projection.text.length },
				language: 'fr'
			})
		);
		expect(result.document.languageRanges.find((range) => range.language === 'de')).toEqual(
			hidden.document.languageRanges[0]
		);
		for (let at = 0; at < source.content.length; at++) {
			const language =
				result.document.languageRanges.find((range) => range.from <= at && at < range.to)
					?.language ?? result.document.defaultLanguage;
			expect(language).toBe(from <= at && at < to ? 'de' : 'fr');
		}
		expect(result.projection.text).toBe(projection.text);
		expect(value(renderProfile(result.document, 'musixmatch')).text).toBe('Moon Star Sun');
		expect(result.document.forms).toEqual(hidden.document.forms);
		expect(validateModel(result.document).ok).toBe(true);
	}
	expect(JSON.stringify(hidden.document)).toBe(before);
});
