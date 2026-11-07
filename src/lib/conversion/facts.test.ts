import { describe, expect, it } from 'vitest';
import {
	importDocument,
	parseProjection,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	validateModel,
	type ConversionDocument,
	type EngineResult,
	type Projection
} from './index.js';
import type { InstrumentalIntervalFacts, QuantityFacts } from '#lib/profiles/decisions.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
	return result.value;
}
function view(document: ConversionDocument, profile: Projection['profile'] = 'musixmatch') {
	return value(renderProfile(document, profile));
}
function imported(text: string) {
	return value(
		importDocument({ text, profile: 'genius', language: 'en', contentKind: 'original' })
	);
}
function quantity(value: string): QuantityFacts {
	return {
		profile: 'musixmatch',
		language: 'en',
		value,
		usage: 'ordinary-cardinal',
		pronunciation: 'whole-quantity'
	};
}

describe('complete English quantity selections', () => {
	it('bounds recognition by explicit language ownership without loosening cross-language refusal', () => {
		const initial = imported('twenty one stars');
		const document = value(
			resolveDecision(initial, view(initial), {
				kind: 'setPassageLanguage',
				range: { from: 7, to: 10 },
				language: 'fr'
			})
		).document;
		const original = JSON.stringify(document);
		const english = resolveDecision(document, view(document), {
			kind: 'confirmQuantity',
			range: { from: 0, to: 6 },
			facts: { ...quantity('20'), spokenForm: 'twenty' }
		});
		expect(english.ok).toBe(true);
		const mixed = resolveDecision(document, view(document), {
			kind: 'confirmQuantity',
			range: { from: 0, to: 10 },
			facts: { ...quantity('21'), spokenForm: 'twenty one' }
		});
		expect(mixed.ok).toBe(false);
		expect(JSON.stringify(document)).toBe(original);
	});
	it.each([
		['Twenty-one stars', 0, 6, '20', 'Twenty'],
		['one hundred stars', 4, 11, '100', 'hundred'],
		['one hundred and twenty-one stars', 16, 22, '20', 'twenty']
	] as const)(
		'refuses a selected component of %s without changing its model',
		(text, from, to, amount, spokenForm) => {
			const document = imported(text);
			const original = JSON.stringify(document);
			const result = resolveDecision(document, view(document), {
				kind: 'confirmQuantity',
				range: { from, to },
				facts: { ...quantity(amount), spokenForm }
			});
			expect(result.ok).toBe(false);
			expect(JSON.stringify(document)).toBe(original);
		}
	);
	it.each([
		['Twenty-one', '21'],
		['twenty one', '21'],
		['one hundred', '100'],
		['one hundred and twenty-one', '121'],
		['two dozen', '24']
	] as const)(
		'preserves the source of the explicitly confirmed whole phrase %s',
		(words, amount) => {
			const document = imported(`${words} stars`);
			const result = value(
				resolveDecision(document, view(document), {
					kind: 'confirmQuantity',
					range: { from: 0, to: words.length },
					facts: { ...quantity(amount), spokenForm: words }
				})
			);
			expect(result.projection.text).toBe(`${amount} stars`);
			expect(view(result.document, 'genius').text).toBe(`${words} stars`);
			expect(result.document.decisions.at(-1)).toMatchObject({ from: 0, to: words.length });
		}
	);
});
function interval(document: ConversionDocument): InstrumentalIntervalFacts {
	return {
		language: 'en',
		recordingId: 'recording:1',
		currentRecordingId: 'recording:1',
		startMs: 1000,
		endMs: 20001,
		recordingDurationMs: 40000,
		lyricalContent: 'none-confirmed',
		placement: 'between-tagged-sections',
		beforeSectionId: document.sections[0]!.id,
		afterSectionId: document.sections[1]!.id
	};
}
function withInterval() {
	let document = imported('[Verse]\nOne\n\n[Chorus]\nTwo');
	document = value(
		resolveDecision(document, view(document), {
			kind: 'setSectionType',
			sectionId: document.sections[0]!.id,
			type: 'Verse'
		})
	).document;
	document = value(
		resolveDecision(document, view(document), {
			kind: 'setSectionType',
			sectionId: document.sections[1]!.id,
			type: 'Chorus'
		})
	).document;
	return value(
		resolveDecision(document, view(document), {
			kind: 'confirmInstrumentalInterval',
			facts: interval(document)
		})
	);
}

describe('confirmed scoped conversion facts', () => {
	it.each(
		['13', '１３', '١٣', '۱۳'].flatMap((source) =>
			['13', '１３', '١٣', '۱۳'].map((target) => [source, target])
		)
	)('validates source %s independently of chosen output %s', (source, target) => {
		const text = `[Verse]\nJ'ai compté [${source}](123456) étoiles`;
		const document = value(
			importDocument({ text, profile: 'genius', language: 'fr', contentKind: 'original' })
		);
		const projection = view(document);
		const from = projection.text.indexOf(source);
		const before = JSON.stringify(document);
		const result = value(
			resolveDecision(document, projection, {
				kind: 'confirmQuantity',
				range: { from, to: from + source.length },
				facts: { ...quantity('13'), digitForm: target }
			})
		);
		expect(result.projection.text).toBe(`J'ai compté ${target} étoiles`);
		expect(view(result.document, 'genius').text).toBe(text);
		expect(result.document.content).toBe(document.content);
		for (const key of [
			'owners',
			'wrappers',
			'sections',
			'lines',
			'links',
			'voices',
			'languageRanges'
		] as const)
			expect(result.document[key]).toEqual(document[key]);
		expect(validateModel(result.document).ok).toBe(true);
		expect(JSON.stringify(document)).toBe(before);
	});

	it.each([
		['１４', '13', '13'],
		['１３', '13', '14'],
		['０１３', '13', '13'],
		['１３', '13', '０１３'],
		['1３', '13', '13'],
		['１３', '13', '1３'],
		['13', '13', '014'],
		['013', '13', '13']
	])('refuses source %s value %s target %s without mutation', (source, exact, target) => {
		const document = value(
			importDocument({
				text: `[Verse]\nJ'ai compté [${source}](123456) étoiles`,
				profile: 'genius',
				language: 'fr',
				contentKind: 'original'
			})
		);
		const projection = view(document);
		const from = projection.text.indexOf(source);
		const before = JSON.stringify({ document, projection });
		expect(
			resolveDecision(document, projection, {
				kind: 'confirmQuantity',
				range: { from, to: from + source.length },
				facts: { ...quantity(exact), digitForm: target }
			}).ok
		).toBe(false);
		expect(JSON.stringify({ document, projection })).toBe(before);
	});

	it('preserves quantity scope, roles and assigned-language refusals across digit styles', () => {
		const initial = value(
			importDocument({
				text: '１３ étoiles',
				profile: 'genius',
				language: 'fr',
				contentKind: 'original'
			})
		);
		const facts = { ...quantity('13'), digitForm: '13' };
		const attempt = (document: ConversionDocument, from: number, to: number, supplied = facts) => {
			const projection = view(document);
			const before = JSON.stringify({ document, projection });
			const result = resolveDecision(document, projection, {
				kind: 'confirmQuantity',
				range: { from, to },
				facts: supplied
			});
			expect(result.ok).toBe(false);
			expect(JSON.stringify({ document, projection })).toBe(before);
		};
		attempt(initial, 0, 1, { ...facts, value: '1', digitForm: '1' });
		attempt(initial, 1, 2, { ...facts, value: '3', digitForm: '3' });
		for (const usage of [
			'date-or-time',
			'name-or-identifier',
			'fixed-expression',
			'phone-or-decade',
			'unknown'
		] as const)
			attempt(initial, 0, 2, { ...facts, usage });
		for (const pronunciation of ['individual-digits', 'unknown'] as const)
			attempt(initial, 0, 2, { ...facts, pronunciation });
		for (const language of ['ar', 'ko', 'fi', 'es']) {
			const changed = value(
				resolveDecision(initial, view(initial), { kind: 'setLanguage', language })
			).document;
			attempt(changed, 0, 2);
		}
		const scoped = value(
			resolveDecision(initial, view(initial), {
				kind: 'setPassageLanguage',
				range: { from: 1, to: 2 },
				language: 'en'
			})
		).document;
		attempt(scoped, 0, 2);
		const french = value(
			resolveDecision(initial, view(initial), { kind: 'setLanguage', language: 'ar' })
		).document;
		const assigned = value(
			resolveDecision(french, view(french), {
				kind: 'setPassageLanguage',
				range: { from: 0, to: 2 },
				language: 'fr'
			})
		).document;
		expect(
			resolveDecision(assigned, view(assigned), {
				kind: 'confirmQuantity',
				range: { from: 0, to: 2 },
				facts
			}).ok
		).toBe(true);
	});
	it.each(['\n', '\r\n', '\r'])(
		'reclassifies one explicitly selected literal marker with %j endings without duplicating it',
		(ending) => {
			const text = ['[Verse]', 'One', '', '#INSTRUMENTAL', '', '[Chorus]', 'Two'].join(ending);
			let document = imported(text);
			for (const [index, type] of ['Verse', 'Chorus'].entries())
				document = value(
					resolveDecision(document, view(document), {
						kind: 'setSectionType',
						sectionId: document.sections[index]!.id,
						type: type === 'Verse' ? 'Verse' : 'Chorus'
					})
				).document;
			const projection = view(document);
			const from = projection.text.indexOf('#INSTRUMENTAL');
			const original = JSON.stringify(document);
			const action = {
				kind: 'confirmInstrumentalInterval' as const,
				facts: interval(document),
				markerRange: { from, to: from + '#INSTRUMENTAL'.length }
			};
			const result = value(resolveDecision(document, projection, action));
			expect(result.projection.text).toBe(projection.text);
			expect(result.changes).toEqual([]);
			expect(result.document.markers).toHaveLength(1);
			expect(result.document.content).toBe(['One', '', 'Two'].join(ending));
			expect(view(result.document, 'genius').text).toBe(
				['[Verse]', 'One', '', '[Chorus]', 'Two'].join(ending)
			);
			expect(JSON.stringify(document)).toBe(original);
			expect(value(resolveDecision(document, projection, action)).document).toEqual(
				result.document
			);
		}
	);
	it('adds only the required blank line when confirming a selected literal marker without one', () => {
		let document = imported('[Verse]\nOne\n\n#INSTRUMENTAL\n[Chorus]\nTwo');
		for (const [index, type] of ['Verse', 'Chorus'].entries())
			document = value(
				resolveDecision(document, view(document), {
					kind: 'setSectionType',
					sectionId: document.sections[index]!.id,
					type: type === 'Verse' ? 'Verse' : 'Chorus'
				})
			).document;
		const projection = view(document);
		const from = projection.text.indexOf('#INSTRUMENTAL');
		const result = value(
			resolveDecision(document, projection, {
				kind: 'confirmInstrumentalInterval',
				facts: interval(document),
				markerRange: { from, to: from + 13 }
			})
		);
		expect(result.projection.text).toBe('One\n\n#INSTRUMENTAL\n\nTwo');
		expect(result.document.markers).toHaveLength(1);
		expect(view(result.document, 'genius').text).toBe('[Verse]\nOne\n\n[Chorus]\nTwo');
	});
	it('refuses to consume unselected lyrics or retained details while reclassifying a marker', () => {
		let document = imported('[Verse]\nOne\n#INSTRUMENTAL\nAnother lyric\n[Chorus]\nTwo');
		for (const [index, type] of ['Verse', 'Chorus'].entries())
			document = value(
				resolveDecision(document, view(document), {
					kind: 'setSectionType',
					sectionId: document.sections[index]!.id,
					type: type === 'Verse' ? 'Verse' : 'Chorus'
				})
			).document;
		const projection = view(document);
		const from = projection.text.indexOf('#INSTRUMENTAL');
		const original = JSON.stringify(document);
		expect(
			resolveDecision(document, projection, {
				kind: 'confirmInstrumentalInterval',
				facts: interval(document),
				markerRange: { from, to: from + 13 }
			}).ok
		).toBe(false);
		expect(
			resolveDecision(document, projection, {
				kind: 'confirmInstrumentalInterval',
				facts: interval(document),
				markerRange: { from, to: from + 14 }
			}).ok
		).toBe(false);
		expect(JSON.stringify(document)).toBe(original);
	});
	it('refuses to erase a hidden annotation attached to the selected literal marker', () => {
		let document = imported('[Verse]\nOne\n\n[#INSTRUMENTAL](123)\n\n[Chorus]\nTwo');
		for (const [index, type] of ['Verse', 'Chorus'].entries())
			document = value(
				resolveDecision(document, view(document), {
					kind: 'setSectionType',
					sectionId: document.sections[index]!.id,
					type: type === 'Verse' ? 'Verse' : 'Chorus'
				})
			).document;
		const projection = view(document);
		const from = projection.text.indexOf('#INSTRUMENTAL');
		const original = JSON.stringify(document);
		expect(
			resolveDecision(document, projection, {
				kind: 'confirmInstrumentalInterval',
				facts: interval(document),
				markerRange: { from, to: from + 13 }
			}).ok
		).toBe(false);
		expect(JSON.stringify(document)).toBe(original);
	});
	it('converts a confirmed exact quantity without changing its source and invalidates only edits to that quantity', () => {
		const document = imported('[Verse]\n2 stars rise');
		const changed = value(
			resolveDecision(document, view(document), {
				kind: 'confirmQuantity',
				range: { from: 0, to: 1 },
				facts: quantity('2')
			})
		);
		expect(changed.projection.text).toBe('two stars rise');
		expect(view(changed.document, 'genius').text).toBe('[Verse]\n2 stars rise');
		const unrelated = value(
			reconcileEdit(changed.document, changed.projection, {
				changes: [{ from: 10, to: 14, insert: 'shine' }]
			})
		);
		expect(unrelated.projection.text).toBe('two stars shine');
		expect(unrelated.document.decisions.map((entry) => entry.kind)).toEqual(['quantity']);
		const edited = value(
			reconcileEdit(unrelated.document, unrelated.projection, {
				changes: [{ from: 0, to: 3, insert: 'three' }]
			})
		);
		expect(edited.document.decisions).toEqual([]);
		expect(view(edited.document, 'genius').text).toBe('[Verse]\nthree stars shine');
	});
	it('refuses partial digits and mismatched or unsupported readings without mutation', () => {
		const document = imported('12 moon');
		const original = JSON.stringify(document);
		for (const [range, facts] of [
			[{ from: 1, to: 2 }, quantity('2')],
			[{ from: 0, to: 2 }, quantity('3')],
			[{ from: 3, to: 7 }, quantity('2')],
			[
				{ from: 0, to: 2 },
				{ ...quantity('12'), pronunciation: 'individual-digits' }
			]
		] as const)
			expect(
				resolveDecision(document, view(document), { kind: 'confirmQuantity', range, facts }).ok
			).toBe(false);
		expect(JSON.stringify(document)).toBe(original);
	});
	it('keeps authored numeric forms through language changes and marks scoped confirmation stale', () => {
		const document = imported('2 stars');
		const confirmed = value(
			resolveDecision(document, view(document), {
				kind: 'confirmQuantity',
				range: { from: 0, to: 1 },
				facts: quantity('2')
			})
		);
		const changed = value(
			resolveDecision(confirmed.document, confirmed.projection, {
				kind: 'setLanguage',
				language: 'fr'
			})
		);
		expect(changed.projection.text).toBe('two stars');
		expect(
			changed.projection.findings.some((entry) => entry.code === 'quantity-reconfirmation')
		).toBe(true);
	});
	it('stores an instrumental marker outside shared lyrics and preserves both projections without mutation', () => {
		const result = withInterval();
		expect(result.document.content).toBe('One\n\nTwo');
		expect(result.projection.text).toBe('One\n\n#INSTRUMENTAL\n\nTwo');
		expect(
			parseProjection(result.document, result.projection).sections.flatMap((section) =>
				section.lines.map((line) => line.text)
			)
		).toEqual(['One', 'Two']);
		const original = JSON.stringify(result.document);
		for (let i = 0; i < 20; i++) {
			expect(view(result.document, 'genius').text).toBe('[Verse]\nOne\n\n[Chorus]\nTwo');
			expect(view(result.document).text).toBe(result.projection.text);
		}
		expect(JSON.stringify(result.document)).toBe(original);
	});
	it.each(['genius', 'musixmatch'] as const)(
		'maps retained marker facts through unrelated %s edits',
		(profile) => {
			const result = withInterval();
			const projection = view(result.document, profile);
			const at = projection.text.indexOf('One');
			const edited = value(
				reconcileEdit(result.document, projection, {
					changes: [{ from: at, to: at + 3, insert: 'First verse' }]
				})
			);
			expect(view(edited.document).text).toBe('First verse\n\n#INSTRUMENTAL\n\nTwo');
			expect(edited.document.markers).toHaveLength(1);
			expect(validateModel(edited.document).ok).toBe(true);
		}
	);
	it.each([
		{ offset: 0, count: 15, insert: '' },
		{ offset: 1, count: 1, insert: 'x' },
		{ offset: 0, count: 0, insert: 'before\n' },
		{ offset: 13, count: 0, insert: '!' }
	])('preserves exact typing in a generated marker and retires its facts (%j)', (edit) => {
		const result = withInterval();
		const at = result.projection.text.indexOf('#INSTRUMENTAL') + edit.offset;
		const expected =
			result.projection.text.slice(0, at) +
			edit.insert +
			result.projection.text.slice(at + edit.count);
		const changed = value(
			reconcileEdit(result.document, result.projection, {
				changes: [{ from: at, to: at + edit.count, insert: edit.insert }]
			})
		);
		expect(changed.projection.text).toBe(expected);
		expect(changed.document.markers).toEqual([]);
		expect(changed.document.decisions).toEqual([]);
		expect(view(changed.document).text).toBe(expected);
		expect(validateModel(changed.document).ok).toBe(true);
	});
	it('keeps marker text when recording context changes and requests reconfirmation', () => {
		const result = withInterval();
		const changed = value(
			resolveDecision(result.document, result.projection, {
				kind: 'setRecording',
				recordingId: 'recording:2'
			})
		);
		expect(changed.projection.text).toBe(result.projection.text);
		expect(
			changed.projection.findings.some((entry) => entry.code === 'instrumental-reconfirmation')
		).toBe(true);
		expect(
			resolveDecision(changed.document, changed.projection, {
				kind: 'confirmInstrumentalInterval',
				facts: interval(changed.document)
			}).ok
		).toBe(false);
	});
	it('requires explicit marker removal before a dependent section boundary is removed', () => {
		const result = withInterval();
		expect(
			resolveDecision(result.document, result.projection, {
				kind: 'removeSection',
				sectionId: result.document.sections[1]!.id
			}).ok
		).toBe(false);
		const removed = value(
			resolveDecision(result.document, result.projection, {
				kind: 'removeDetail',
				detailId: result.document.markers[0]!.id
			})
		);
		expect(removed.projection.text).toBe('One\n\nTwo');
		expect(removed.document.decisions).toEqual([]);
	});
	it('rejects forged marker association and malformed persisted facts', () => {
		const result = withInterval();
		expect(
			validateModel({
				...result.document,
				markers: result.document.markers.map((entry) => ({ ...entry, at: 0 }))
			}).ok
		).toBe(false);
		expect(
			validateModel({
				...result.document,
				decisions: result.document.decisions.map((entry) => ({
					...entry,
					facts: 'facts' in entry ? { ...entry.facts, startMs: '1000' } : { startMs: '1000' }
				}))
			}).ok
		).toBe(false);
	});
});

it('tags only the stable section while preserving Genius source and every other identity', () => {
	const source = '[Custom opening: Mira]\n[The return: Noor]\nStay [beside](123456) me';
	const document = imported(source);
	const sectionId = document.sections[1]!.id;
	const result = value(
		resolveDecision(document, view(document), { kind: 'setSectionType', sectionId, type: 'Chorus' })
	);
	expect(result.document).toEqual({
		...document,
		sections: document.sections.map((section) =>
			section.id === sectionId ? { ...section, type: 'Chorus' } : section
		)
	});
	expect(view(result.document, 'genius').text).toBe(source);
	expect(result.projection.text).toBe(view(document).text);
	const stale = resolveDecision(document, view(document), {
		kind: 'setSectionType',
		sectionId: 'removed-section',
		type: 'Verse'
	});
	expect(stale.ok).toBe(false);
	if (!stale.ok) expect(stale.refusal.message).toBe('This section no longer exists.');
});
