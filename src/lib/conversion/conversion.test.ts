import { describe, expect, it } from 'vitest';
import {
	contentOffset,
	importDocument,
	mapSelection,
	planProfileSwitch,
	parseProjection,
	projectOffset,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	updateMetadata,
	validateModel,
	type ConversionDocument,
	type EngineResult,
	type Projection
} from './index.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
	return result.value;
}
function imported(text: string, profile: 'genius' | 'musixmatch' = 'genius'): ConversionDocument {
	return value(importDocument({ text, profile }));
}
function rendered(document: ConversionDocument, profile: 'genius' | 'musixmatch'): Projection {
	return value(renderProfile(document, profile));
}

describe('lossless shared conversion', () => {
	it('maps omitted forms and retained section identities across a long French document', () => {
		const text = '[Couplet]\nQui est là ?\nPourquoi donc ?\n\n'.repeat(2500);
		const document = value(importDocument({ text, profile: 'genius', language: 'fr' }));
		const projection = rendered(document, 'musixmatch');
		expect(projection.text).toBe('Qui est là?\nPourquoi donc?\n\n'.repeat(2500));
		const parsed = parseProjection(document, projection);
		expect(parsed.sections.map((section) => section.conversionSectionId)).toEqual(
			document.sections.map((section) => section.id)
		);
		for (const hidden of projection.hidden) {
			if (hidden.contentTo === undefined) continue;
			expect(projectOffset(projection, hidden.contentAt)).toBe(hidden.at);
			expect(contentOffset(projection, hidden.at, -1)).toBe(hidden.contentAt);
			expect(contentOffset(projection, hidden.at, 1)).toBe(hidden.contentTo);
		}
		expect(rendered(document, 'genius').text).toBe(text);
	});
	it.each([
		['en', '[Verse: Mira]\n<i>[Moon](000123)</i>\n\n[Chorus: Noor]\nStars', 'Moon\n\nStars'],
		['no', '  [Refreng 2: Eira]  \nÆ vandre åleine\n', 'Æ vandre åleine\n'],
		['ar', '[المقطع: نور]\n<b>قَمَرٌ 🌙</b>\n[اللازمة]\nليل', 'قَمَرٌ 🌙\nليل'],
		['de', '[Part 1]\nGeh’ aus’m Haus\n[Hook]\nEin Licht', 'Geh’ aus’m Haus\nEin Licht'],
		['es', '[Verso]\nÉl dijo: «Ven»\n[Coro]\nAquí', 'Él dijo: «Ven»\nAquí'],
		['fr', '[Couplet]\nL’étoile est là\n[Refrain]\nQui ?', 'L’étoile est là\nQui?'],
		['ja', '[Verse]\n「月」🌙\n[Chorus]\n青い空', '「月」🌙\n青い空'],
		['ko', '[Verse]\n하늘 속 달\n[Chorus]\n빛이 나', '하늘 속 달\n빛이 나']
	])(
		'switches %s repeatedly without mutating a single authored byte or record',
		(language, genius, musixmatch) => {
			const document = value(importDocument({ text: genius, profile: 'genius', language }));
			const snapshot = JSON.stringify(document);
			for (let iteration = 0; iteration < 50; iteration++) {
				const target = value(planProfileSwitch(document, { from: 'genius', to: 'musixmatch' }));
				expect(target.document).toBe(document);
				expect(target.projection.text).toBe(musixmatch);
				expect(
					value(planProfileSwitch(document, { from: 'musixmatch', to: 'genius' })).projection.text
				).toBe(genius);
			}
			expect(JSON.stringify(document)).toBe(snapshot);
		}
	);

	it.each([
		'',
		'\n\n',
		'[Verse]',
		'[Verse]\n\nHi\n[Chorus]',
		'[Verse]\n[Chorus]\n[Outro]',
		'[Verse\nWords',
		'[?]\n[??]\n[]\n[: Mira]',
		'[a [b](123)](456)',
		'<i>[one\ntwo](9999999999999999999999999)</i>',
		'[unfinished](abc)\n<em>literal</em>',
		'<i>[cross</i>](123)'
	])('reconstructs exact syntax and incomplete input: %j', (text) => {
		const document = imported(text);
		expect(rendered(document, 'genius').text).toBe(text);
		const serialized = JSON.parse(JSON.stringify(document));
		expect(rendered(value(validateModel(serialized)), 'genius').text).toBe(text);
	});

	it('stores only the wrapper syntax and edits shared words without restoring stale lyrics', () => {
		const document = imported('[Verse: Mira]\n<i>[moon](000123)</i>\n\n[Chorus: Noor]\nSky');
		const before = JSON.stringify(document);
		const edit = value(
			reconcileEdit(document, rendered(document, 'musixmatch'), {
				changes: [{ from: 0, to: 4, insert: 'stars' }]
			})
		);
		expect(rendered(edit.document, 'genius').text).toBe(
			'[Verse: Mira]\n<i>[stars](000123)</i>\n\n[Chorus: Noor]\nSky'
		);
		expect(edit.document.wrappers.map((wrapper) => wrapper.id)).toEqual(
			document.wrappers.map((wrapper) => wrapper.id)
		);
		expect(edit.document.nextId).toBe(document.nextId + 1); // One deliberate authored form, never a switch allocation.
		expect(JSON.stringify(document)).toBe(before);
		expect(JSON.stringify(edit.document.wrappers)).not.toContain('moon');
	});

	it('renders reviewed French and Japanese conversions without ever rewriting their source', () => {
		const french = value(
			importDocument({
				text: '[Couplet]\nQui es-tu ?\nPourquoi\u00a0?',
				profile: 'genius',
				language: 'fr-CA'
			})
		);
		expect(rendered(french, 'musixmatch').text).toBe('Qui es-tu?\nPourquoi?');
		expect(rendered(french, 'genius').text).toBe('[Couplet]\nQui es-tu ?\nPourquoi\u00a0?');
		const japanese = value(
			importDocument({ text: '[Verse]\n月?\nHello！\n🌙?', profile: 'genius', language: 'ja-JP' })
		);
		expect(rendered(japanese, 'musixmatch').text).toBe('月？\nHello!\n🌙?');
		expect(rendered(japanese, 'genius').text).toBe('[Verse]\n月?\nHello！\n🌙?');
		const authored = value(importDocument({ text: '月?', profile: 'musixmatch', language: 'ja' }));
		expect(rendered(authored, 'musixmatch').text).toBe('月?');
	});

	it('materializes only an edited transformed unit and preserves deliberately authored exceptions', () => {
		const document = value(
			importDocument({ text: '[Verse]\n月?\n空?', profile: 'genius', language: 'ja' })
		);
		const projection = rendered(document, 'musixmatch');
		const edited = value(
			reconcileEdit(document, projection, { changes: [{ from: 1, to: 2, insert: '?' }] })
		);
		expect(edited.projection.text).toBe('月?\n空？');
		expect(rendered(edited.document, 'genius').text).toBe('[Verse]\n月?\n空?');
		const word = value(
			reconcileEdit(edited.document, edited.projection, {
				changes: [{ from: 0, to: 1, insert: '太陽' }]
			})
		);
		expect(word.projection.text).toBe('太陽?\n空？');
		expect(rendered(word.document, 'genius').text).toBe('[Verse]\n太陽?\n空?');
	});

	it('handles typing at a removed-space boundary without accumulating whitespace', () => {
		const document = value(
			importDocument({ text: '[Couplet]\nQui ?', profile: 'genius', language: 'fr' })
		);
		const edited = value(
			reconcileEdit(document, rendered(document, 'musixmatch'), {
				changes: [{ from: 3, to: 3, insert: ' ' }]
			})
		);
		expect(edited.projection.text).toBe('Qui ?');
		expect(rendered(edited.document, 'genius').text).toBe('[Couplet]\nQui ?');
		for (let pass = 0; pass < 20; pass++)
			expect(rendered(edited.document, 'musixmatch').text).toBe('Qui ?');
	});

	it('changes language and scoped language without silently rewriting the active text', () => {
		const document = value(
			importDocument({ text: 'Qui ?\nMoon ?', profile: 'genius', language: 'fr' })
		);
		const language = value(
			resolveDecision(document, rendered(document, 'musixmatch'), {
				kind: 'setLanguage',
				language: 'en-US'
			})
		);
		expect(language.document.defaultLanguage).toBe('en-US');
		expect(language.projection.text).toBe('Qui?\nMoon?');
		expect(rendered(language.document, 'genius').text).toBe('Qui ?\nMoon ?');
		const scoped = value(
			resolveDecision(document, rendered(document, 'genius'), {
				kind: 'setPassageLanguage',
				range: { from: 0, to: 12 },
				language: 'ja'
			})
		);
		const divided = value(
			resolveDecision(scoped.document, scoped.projection, {
				kind: 'setPassageLanguage',
				range: { from: 2, to: 8 },
				language: 'ar'
			})
		);
		expect(
			divided.document.languageRanges.map(({ from, to, language }) => ({ from, to, language }))
		).toEqual([
			{ from: 0, to: 2, language: 'ja' },
			{ from: 2, to: 8, language: 'ar' },
			{ from: 8, to: 12, language: 'ja' }
		]);
		expect(divided.projection.text).toBe(scoped.projection.text);
	});

	it('retains an explicit alternate numeric representation and materializes a partial target edit as one unit', () => {
		const document = imported('[Verse]\nEleven lights');
		const decision = value(
			resolveDecision(document, rendered(document, 'musixmatch'), {
				kind: 'setForm',
				range: { from: 0, to: 6 },
				profile: 'musixmatch',
				text: '11'
			})
		);
		expect(decision.projection.text).toBe('11 lights');
		expect(rendered(decision.document, 'genius').text).toBe('[Verse]\nEleven lights');
		const selection = mapSelection(decision.projection, rendered(decision.document, 'genius'), {
			anchor: 1,
			head: 2
		});
		expect(selection).toEqual({ anchor: 8, head: 14 });
		const edited = value(
			reconcileEdit(decision.document, decision.projection, {
				changes: [{ from: 1, to: 2, insert: '2' }]
			})
		);
		expect(edited.projection.text).toBe('12 lights');
		expect(rendered(edited.document, 'genius').text).toBe('[Verse]\n12 lights');
	});

	it('does not convert a lexical unit across an annotation boundary', () => {
		const document = imported('El[ev](123)en');
		const result = resolveDecision(document, rendered(document, 'musixmatch'), {
			kind: 'setForm',
			range: { from: 0, to: 6 },
			profile: 'musixmatch',
			text: '11'
		});
		expect(result.ok).toBe(false);
		expect(rendered(document, 'genius').text).toBe('El[ev](123)en');
	});

	it('keeps untyped section insertion explicit and refuses losing voice metadata', () => {
		const document = imported('[Verse: Mira]\nMoon\nStars');
		const refuseRemoval = resolveDecision(document, rendered(document, 'musixmatch'), {
			kind: 'removeSection',
			sectionId: document.sections[0]!.id
		});
		expect(refuseRemoval.ok).toBe(false);
		expect(document.voices).toHaveLength(1);
		const insert = value(
			resolveDecision(document, rendered(document, 'musixmatch'), { kind: 'insertSection', at: 5 })
		);
		expect(insert.document.sections[1]!.type).toBeUndefined();
		expect(insert.projection.text).toBe('Moon\nStars');
		expect(rendered(insert.document, 'genius').text).toBe('[Verse: Mira]\nMoon\n[Section]\nStars');
	});

	it('attaches an annotation inside the shared model and removes only that detail', () => {
		const document = imported('[Verse]\nMoon rises');
		const attached = value(
			resolveDecision(document, rendered(document, 'musixmatch'), {
				kind: 'attachAnnotation',
				range: { from: 0, to: 4 },
				annotationId: '00123'
			})
		);
		expect(attached.projection.text).toBe('Moon rises');
		expect(rendered(attached.document, 'genius').text).toBe('[Verse]\n[Moon](00123) rises');
		const removed = value(
			resolveDecision(attached.document, attached.projection, {
				kind: 'removeDetail',
				detailId: attached.document.wrappers[0]!.id
			})
		);
		expect(rendered(removed.document, 'genius').text).toBe('[Verse]\nMoon rises');
	});

	it('keeps the underlying Musixmatch form through an unrelated Genius syntax edit', () => {
		const document = imported('11 lights', 'musixmatch');
		const decision = value(
			resolveDecision(document, rendered(document, 'musixmatch'), {
				kind: 'setForm',
				range: { from: 0, to: 2 },
				profile: 'genius',
				text: 'Eleven'
			})
		);
		const genius = rendered(decision.document, 'genius');
		const edited = value(
			reconcileEdit(decision.document, genius, { changes: [{ from: 7, to: 13, insert: 'stars' }] })
		);
		expect(edited.projection.text).toBe('Eleven stars');
		expect(rendered(edited.document, 'musixmatch').text).toBe('11 stars');
	});

	it('retains section and voice identity while a header delimiter is partially broken', () => {
		const document = imported('[Verse: Mira]\nMoon');
		const projection = rendered(document, 'genius');
		const edited = value(
			reconcileEdit(document, projection, { changes: [{ from: 12, to: 13, insert: '' }] })
		);
		expect(edited.projection.text).toBe('[Verse: Mira\nMoon');
		expect(edited.document.sections[0]!.id).toBe(document.sections[0]!.id);
		expect(edited.document.voices[0]!.id).toBe(document.voices[0]!.id);
		expect(rendered(edited.document, 'musixmatch').text).toBe('[Verse: Mira\nMoon');
		const repaired = value(
			reconcileEdit(edited.document, edited.projection, {
				changes: [{ from: 12, to: 12, insert: ']' }]
			})
		);
		expect(repaired.projection.text).toBe(projection.text);
		expect(repaired.document.sections[0]!.id).toBe(document.sections[0]!.id);
	});

	it('preserves an empty section when its body is deleted and clears it only by an explicit document action', () => {
		const document = imported('[Verse]\nMoon');
		const edited = value(
			reconcileEdit(document, rendered(document, 'musixmatch'), {
				changes: [{ from: 0, to: 4, insert: '' }]
			})
		);
		expect(edited.document.sections[0]!.explicitEmpty).toBe(true);
		expect(rendered(edited.document, 'genius').text).toBe('[Verse]\n');
		const cleared = value(
			resolveDecision(edited.document, edited.projection, { kind: 'clearDocument' })
		);
		expect(cleared.document.sections).toEqual([]);
		expect(cleared.document.nextId).toBe(edited.document.nextId);
		expect(rendered(cleared.document, 'genius').text).toBe('');
	});

	it('requires explicit audio confirmation for a lossy censor representation and retains its source bytes', () => {
		const document = imported('I said ****');
		const range = { from: 7, to: 11 };
		const decided = value(
			resolveDecision(document, rendered(document, 'genius'), {
				kind: 'confirmCensoredToken',
				range,
				heardPrefix: 'sh',
				audioCensored: true
			})
		);
		expect(rendered(decided.document, 'musixmatch').text).toBe('I said sh-');
		expect(rendered(decided.document, 'genius').text).toBe('I said ****');
		expect(decided.document.decisions[0]!.kind).toBe('censored-token');
	});

	it('resolves exact roster identities including ampersands and renames only the named performer', () => {
		const roster = [
			{
				id: 'mira',
				displayName: 'Mira',
				normalizedKey: 'mira',
				aliases: [],
				colorId: 'rose',
				order: 0
			},
			{
				id: 'duo',
				displayName: 'Echo & The Glass',
				normalizedKey: 'echo & the glass',
				aliases: [],
				colorId: 'blue',
				order: 1
			}
		];
		const document = value(
			importDocument({
				text: '[Verse: Mira & <i>Echo &amp; The Glass</i>]\nMoon\n<i>Stars</i>',
				profile: 'genius',
				performers: roster
			})
		);
		expect(document.voices.map((voice) => voice.performerIds)).toEqual([['mira'], ['duo']]);
		const renamed = value(
			resolveDecision(
				document,
				rendered(document, 'musixmatch'),
				{
					kind: 'renamePerformer',
					performerId: 'duo',
					previousName: 'Echo & The Glass',
					displayName: 'Glass & Echo'
				},
				{
					performers: roster.map((entry) =>
						entry.id === 'duo' ? { ...entry, displayName: 'Glass & Echo' } : entry
					)
				}
			)
		);
		expect(renamed.projection.text).toBe('Moon\nStars');
		expect(rendered(renamed.document, 'genius').text).toBe(
			'[Verse: Mira & <i>Glass &amp; Echo</i>]\nMoon\n<i>Stars</i>'
		);
		const removed = value(
			resolveDecision(
				renamed.document,
				renamed.projection,
				{ kind: 'removePerformer', performerId: 'duo' },
				{ performers: roster.filter((entry) => entry.id !== 'duo') }
			)
		);
		expect(removed.document.voices.some((voice) => voice.performerIds.includes('duo'))).toBe(false);
		expect(rendered(removed.document, 'genius').text).toBe('[Verse: Mira]\nMoon\n<i>Stars</i>');
	});

	it('preserves literal Musixmatch input even when it resembles Genius syntax', () => {
		const text = '[Chorus]\n<i>Moon</i> [stars](123)';
		const document = imported(text, 'musixmatch');
		expect(document.sections).toEqual([]);
		expect(document.wrappers).toEqual([]);
		expect(rendered(document, 'genius').text).toBe(text);
		const edit = value(
			reconcileEdit(document, rendered(document, 'musixmatch'), {
				changes: [{ from: text.length, to: text.length, insert: '\n[Verse]' }]
			})
		);
		expect(edit.document.sections).toEqual([]);
		expect(rendered(edit.document, 'genius').text).toBe(`${text}\n[Verse]`);
	});

	it('does not put boundary insertions inside hidden annotations', () => {
		const document = imported('[moon](123)');
		const projection = rendered(document, 'musixmatch');
		const before = value(
			reconcileEdit(document, projection, { changes: [{ from: 0, to: 0, insert: 'blue ' }] })
		);
		expect(rendered(before.document, 'genius').text).toBe('blue [moon](123)');
		const after = value(
			reconcileEdit(document, projection, { changes: [{ from: 4, to: 4, insert: ' rises' }] })
		);
		expect(rendered(after.document, 'genius').text).toBe('[moon](123) rises');
		const inside = value(
			reconcileEdit(document, projection, { changes: [{ from: 2, to: 2, insert: '🌙' }] })
		);
		expect(rendered(inside.document, 'genius').text).toBe('[mo🌙on](123)');
	});

	it('retires deleted annotations and never resurrects deleted content', () => {
		const document = imported('[Verse]\nThe [moon](123) rises');
		const edit = value(
			reconcileEdit(document, rendered(document, 'musixmatch'), {
				changes: [{ from: 4, to: 8, insert: '' }]
			})
		);
		expect(edit.document.wrappers).toEqual([]);
		expect(rendered(edit.document, 'genius').text).toBe('[Verse]\nThe  rises');
	});

	it('handles explicit syntax removal, partial breakage and newly completed syntax in Genius', () => {
		const document = imported('[Verse]\n[moon](123)');
		const projection = rendered(document, 'genius');
		const remove = value(
			reconcileEdit(document, projection, {
				changes: [
					{ from: 8, to: 9, insert: '' },
					{ from: 13, to: 19, insert: '' }
				]
			})
		);
		expect(remove.projection.text).toBe('[Verse]\nmoon');
		expect(remove.document.wrappers).toEqual([]);
		const broken = value(
			reconcileEdit(document, projection, { changes: [{ from: 13, to: 14, insert: '' }] })
		);
		expect(broken.projection.text).toBe('[Verse]\n[moon(123)');
		expect(rendered(broken.document, 'musixmatch').text).toBe('[moon(123)');
		const completed = value(
			reconcileEdit(broken.document, broken.projection, {
				changes: [{ from: 13, to: 13, insert: ']' }]
			})
		);
		expect(completed.projection.text).toBe(projection.text);
		expect(rendered(completed.document, 'musixmatch').text).toBe('moon');
	});

	it('keeps IDs and times on untouched and rewritten lines, including splits and merges', () => {
		const document = value(
			importDocument({
				text: '[Verse]\nMoon rises\nStars fall',
				profile: 'genius',
				lineAnchors: [
					{ line: 2, time: 2 },
					{ line: 3, time: 5 }
				]
			})
		);
		const projection = rendered(document, 'musixmatch');
		const split = value(
			reconcileEdit(document, projection, { changes: [{ from: 0, to: 0, insert: '\n' }] })
		);
		expect(split.projection.lineAnchors).toEqual([
			{ line: 2, time: 2 },
			{ line: 3, time: 5 }
		]);
		expect(split.document.lines[1]!.id).toBe(document.lines[0]!.id);
		const rewritten = value(
			reconcileEdit(document, projection, { changes: [{ from: 0, to: 10, insert: 'Dawn comes' }] })
		);
		expect(rewritten.projection.lineAnchors).toEqual(projection.lineAnchors);
		expect(rewritten.document.lines.map((line) => line.id)).toEqual(
			document.lines.map((line) => line.id)
		);
		const merged = value(
			reconcileEdit(document, projection, { changes: [{ from: 10, to: 11, insert: ' ' }] })
		);
		expect(merged.projection.lineAnchors).toEqual([{ line: 1, time: 2 }]);
		expect(merged.document.lines[0]!.id).toBe(document.lines[0]!.id);
	});

	it('mirrors stored shared passages through Musixmatch and retains independent timing', () => {
		const document = value(
			importDocument({
				text: '[Chorus: Mira]\nMoon rises\n\n[Chorus: Noor]\nMoon rises',
				profile: 'genius',
				lineAnchors: [
					{ line: 2, time: 3 },
					{ line: 5, time: 30 }
				],
				sectionLinks: [
					{
						lines: [1, 4],
						passages: [
							{
								members: [
									{ headerLine: 1, line: 2, column: 0, endLine: 2, endColumn: 10 },
									{ headerLine: 4, line: 5, column: 0, endLine: 5, endColumn: 10 }
								]
							}
						]
					}
				]
			})
		);
		const projection = rendered(document, 'musixmatch');
		const edit = value(
			reconcileEdit(document, projection, { changes: [{ from: 0, to: 4, insert: 'Dawn' }] })
		);
		expect(edit.projection.text).toBe('Dawn rises\n\nDawn rises');
		expect(edit.changes).toEqual([
			{ from: 0, to: 4, insert: 'Dawn' },
			{ from: 12, to: 16, insert: 'Dawn' }
		]);
		expect(rendered(edit.document, 'genius').lineAnchors).toEqual([
			{ line: 2, time: 3 },
			{ line: 5, time: 30 }
		]);
		const second = value(
			reconcileEdit(edit.document, edit.projection, {
				changes: [{ from: 4, to: 4, insert: 'light' }]
			})
		);
		expect(second.projection.text).toBe('Dawnlight rises\n\nDawnlight rises');
		expect(rendered(second.document, 'genius').sectionLinks[0]!.lines).toEqual([1, 4]);
	});

	it('stores metadata-only updates and maps a backward selection through retained syntax', () => {
		const document = imported('[Verse]\n<i>[moon](123)</i>');
		const genius = rendered(document, 'genius');
		const musixmatch = rendered(document, 'musixmatch');
		expect(mapSelection(genius, musixmatch, { anchor: 16, head: 12 })).toEqual({
			anchor: 4,
			head: 0
		});
		const update = value(
			updateMetadata(document, musixmatch, { lineAnchors: [{ line: 1, time: 3.5 }] })
		);
		expect(rendered(update.document, 'genius').lineAnchors).toEqual([{ line: 2, time: 3.5 }]);
		expect(update.document.nextId).toBe(document.nextId);
	});

	it('refuses corrupt or stale rich state before changing any source input', () => {
		const document = imported('[Verse]\nMoon');
		const projection = rendered(document, 'genius');
		const before = JSON.stringify(document);
		expect(validateModel({ ...document, nextId: 1 }).ok).toBe(false);
		expect(validateModel({ ...document, converterVersion: '999' }).ok).toBe(false);
		expect(
			reconcileEdit(
				document,
				{ ...projection, text: 'stale' },
				{ changes: [{ from: 0, to: 0, insert: 'x' }] }
			).ok
		).toBe(false);
		expect(
			reconcileEdit(document, projection, { changes: [{ from: 7, to: 99, insert: '' }] }).ok
		).toBe(false);
		expect(JSON.stringify(document)).toBe(before);
	});

	it('keeps exact edits and render invariance through seeded adversarial edit sequences', () => {
		let state = 197;
		const integer = (max: number) => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			return state % max;
		};
		const inserts = [
			'',
			'x',
			'\n',
			'🌙',
			'e\u0301',
			'[',
			']',
			'<i>',
			'</i>',
			'(123)',
			'ع',
			'日',
			'한'
		];
		let document = imported('[Verse: Mira]\n<i>[moon](123)</i>\n\n[Chorus: Noor]\nMoon rises');
		for (let step = 0; step < 150; step++) {
			const profile = step % 2 ? 'genius' : 'musixmatch';
			const projection = rendered(document, profile);
			const from = integer(projection.text.length + 1);
			const to = Math.min(projection.text.length, from + integer(5));
			const insert = inserts[integer(inserts.length)]!;
			const expected = projection.text.slice(0, from) + insert + projection.text.slice(to);
			const result = value(
				reconcileEdit(document, projection, { changes: [{ from, to, insert }], mirror: false })
			);
			expect(result.projection.text, `step ${step}`).toBe(expected);
			document = result.document;
			const before = JSON.stringify(document);
			for (const selected of ['genius', 'musixmatch', 'genius', 'musixmatch'] as const)
				expect(rendered(document, selected).text).toBe(rendered(document, selected).text);
			expect(JSON.stringify(document)).toBe(before);
		}
	});
});
