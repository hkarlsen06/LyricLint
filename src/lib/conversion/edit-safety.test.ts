import { expect, it } from 'vitest';
import {
	importDocument,
	planProfileSwitch,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	validateModel,
	type EngineResult
} from './index.js';
import { resolveLinkDecision } from './links.js';
import { projectedVoiceGroups } from './voices.js';
import type { PerformerRecord } from '#lib/core/types.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
	return result.value;
}

it.each([
	['月?', '月', '', '？'],
	['月?', '月', 'by', 'by？'],
	['月? 星!', '星', '', '月？ ！'],
	['月? 星!', '星', 'by', '月？ by！'],
	['<i>月?</i>', '月', '', '？'],
	['<i>月?</i>', '月', 'by', 'by？'],
	['月? <i>星!</i>', '星', '', '月？ ！'],
	['月? <i>星!</i>', '星', 'by', '月？ by！'],
	['月? [星!](123456)', '星', '', '月？ ！'],
	['月? [星!](123456)', '星', 'by', '月？ by！']
])(
	'preserves untouched derived punctuation in %s when replacing %s with %j',
	(source, selected, insert, expected) => {
		const text = `[Verse]\n${source}`;
		const document = value(importDocument({ text, profile: 'genius', language: 'ja' }));
		const projection = value(renderProfile(document, 'musixmatch'));
		const from = projection.text.indexOf(selected);
		expect(from).toBeGreaterThanOrEqual(0);
		const edited = value(
			reconcileEdit(document, projection, {
				changes: [{ from, to: from + selected.length, insert }]
			})
		);
		expect(edited.projection.text).toBe(expected);
		expect(value(renderProfile(edited.document, 'genius')).text).toBe(
			text.replace(selected, insert)
		);
		const restored = value(validateModel(JSON.parse(JSON.stringify(edited.document))));
		expect(value(renderProfile(restored, 'musixmatch')).text).toBe(expected);
		expect(restored.wrappers.map((wrapper) => wrapper.id)).toEqual(
			document.wrappers.map((wrapper) => wrapper.id)
		);
	}
);

it('leaves a linked peer local when an interior edit has no exact visible correspondence', () => {
	const original = value(
		importDocument({
			text: '[Chorus]\nWe stay here\n\n[Chorus 2]\nWe stay here',
			profile: 'genius'
		})
	);
	const linked = value(
		resolveLinkDecision(original, value(renderProfile(original, 'musixmatch')), {
			kind: 'linkSections',
			sectionIds: original.sections.map((section) => section.id)
		})
	).document;
	const genius = value(renderProfile(linked, 'genius'));
	const from = genius.text.lastIndexOf('We stay here');
	const formed = value(
		resolveDecision(linked, genius, {
			kind: 'setForm',
			range: { from, to: from + 12 },
			profile: 'musixmatch',
			text: 'We remain here'
		})
	).document;
	const projection = value(renderProfile(formed, 'musixmatch'));
	expect(projection.text).toBe('We stay here\n\nWe remain here');
	const edited = value(
		reconcileEdit(formed, projection, { changes: [{ from: 3, to: 7, insert: 'go' }] })
	);
	expect(edited.projection.text).toBe('We go here\n\nWe remain here');
	expect(value(renderProfile(edited.document, 'genius')).text).toBe(
		'[Chorus]\nWe go here\n\n[Chorus 2]\nWe stay here'
	);
	expect(edited.document.forms.find((form) => form.id === formed.forms[0]!.id)).toMatchObject({
		text: 'We remain here'
	});
	const restored = value(validateModel(JSON.parse(JSON.stringify(edited.document))));
	expect(value(renderProfile(restored, 'musixmatch')).text).toBe(edited.projection.text);
});

it('keeps the later performer exclusive when its heading becomes literal', () => {
	const performers: PerformerRecord[] = ['Mira', 'Noor', 'Ed'].map((displayName, order) => ({
		id: displayName.toLowerCase(),
		displayName,
		normalizedKey: displayName.toLowerCase(),
		aliases: [],
		colorId: 'olive',
		order
	}));
	const text = '[Verse: Mira]\nOne\n[Chorus: Noor]\nTwo';
	const original = value(importDocument({ text, profile: 'genius', performers }));
	const switched = value(planProfileSwitch(original, { from: 'genius', to: 'musixmatch' }));
	const back = value(planProfileSwitch(switched.document, { from: 'musixmatch', to: 'genius' }));
	const from = text.indexOf('[Chorus');
	const edited = value(
		reconcileEdit(back.document, back.projection, {
			changes: [{ from, to: from + 1, insert: '' }],
			performers
		})
	);
	expect(edited.projection.text).toBe(text.slice(0, from) + text.slice(from + 1));
	const restored = value(validateModel(JSON.parse(JSON.stringify(edited.document))));
	const projection = value(renderProfile(restored, 'musixmatch'));
	const ranges = projectedVoiceGroups(restored, projection);
	for (const [word, performer] of [
		['One', 'mira'],
		['Two', 'noor']
	]) {
		const at = projection.text.indexOf(word);
		expect(
			ranges
				.filter((range) => range.from <= at && at < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([[performer]]);
	}
	expect(restored.voices.map((voice) => voice.id)).toEqual(
		original.voices.map((voice) => voice.id)
	);
	const genius = value(renderProfile(restored, 'genius'));
	const at = genius.text.indexOf('One');
	const inserted = value(
		reconcileEdit(restored, genius, {
			changes: [{ from: at, to: at, insert: '[Bridge: Ed]\n' }],
			performers
		})
	);
	expect(inserted.projection.text).toBe(
		genius.text.slice(0, at) + '[Bridge: Ed]\n' + genius.text.slice(at)
	);
	const insertedModel = value(validateModel(JSON.parse(JSON.stringify(inserted.document))));
	const insertedProjection = value(renderProfile(insertedModel, 'musixmatch'));
	const insertedRanges = projectedVoiceGroups(insertedModel, insertedProjection);
	for (const [word, performer] of [
		['One', 'ed'],
		['Two', 'noor']
	]) {
		const position = insertedProjection.text.indexOf(word);
		expect(
			insertedRanges
				.filter((range) => range.from <= position && position < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([[performer]]);
	}
});
