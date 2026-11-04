import { expect, it } from 'vitest';
import { importDocument, reconcileEdit, renderProfile, type EngineResult } from './index.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
	return result.value;
}

it.each([
	['[silver compass](123456) by the door', 'compass by', 'by', '[silver](123456) by the door'],
	['by the [silver compass](123456)', 'the silver', 'a', 'by a [compass](123456)'],
	['[silver compass](123456)', 'compass', '', '[silver](123456) '],
	['[silver compass](123456)', 'silver', '', ' [compass](123456)'],
	['[ silver](123456) by', 'silver by', 'gold', ' gold'],
	['[<i>silver </i>compass](123456) by', 'compass by', 'by', '[<i>silver</i>](123456) by'],
	['by [silver<i> compass</i>](123456)', 'by silver', 'by', 'by [<i>compass</i>](123456)'],
	['[月 🌙 compass](123456) by', 'compass by', 'by', '[月 🌙](123456) by']
])(
	'keeps annotation delimiters on surviving words after replacing %j / %j',
	(source, selected, insert, expected) => {
		const model = value(importDocument({ text: `[Verse: Mira]\n${source}`, profile: 'genius' }));
		const projection = value(renderProfile(model, 'musixmatch'));
		const from = projection.text.indexOf(selected);
		expect(from).toBeGreaterThanOrEqual(0);
		const result = value(
			reconcileEdit(model, projection, {
				changes: [{ from, to: from + selected.length, insert }]
			})
		);
		expect(result.projection.text).toBe(
			projection.text.slice(0, from) + insert + projection.text.slice(from + selected.length)
		);
		expect(value(renderProfile(result.document, 'genius')).text).toBe(`[Verse: Mira]\n${expected}`);
		const restored = JSON.parse(JSON.stringify(result.document));
		expect(value(renderProfile(restored, 'musixmatch')).text).toBe(result.projection.text);
	}
);

it('preserves authored annotation spacing during unrelated and enclosed edits', () => {
	const model = value(importDocument({ text: '[ silver compass ](123456) by', profile: 'genius' }));
	const projection = value(renderProfile(model, 'musixmatch'));
	for (const selected of ['compass', 'by']) {
		const from = projection.text.indexOf(selected);
		const result = value(
			reconcileEdit(model, projection, {
				changes: [{ from, to: from + selected.length, insert: 'gold' }]
			})
		);
		expect(value(renderProfile(result.document, 'genius')).text).toBe(
			'[ silver compass ](123456) by'.replace(selected, 'gold')
		);
	}
});

it.each([
	['[silver <i></i> compass](123456) by', 'compass by', '[silver<i></i>](123456)  by'],
	['by [silver <i></i> compass](123456)', 'by silver', 'by  [<i></i>compass](123456)']
])('preserves empty nested syntax when trimming %j', (source, selected, expected) => {
	const model = value(importDocument({ text: `[Verse: Mira]\n${source}`, profile: 'genius' }));
	const projection = value(renderProfile(model, 'musixmatch'));
	const from = projection.text.indexOf(selected);
	const result = value(
		reconcileEdit(model, projection, {
			changes: [{ from, to: from + selected.length, insert: 'by' }]
		})
	);
	expect(value(renderProfile(result.document, 'genius')).text).toBe(`[Verse: Mira]\n${expected}`);
	expect(result.document.wrappers.map((wrapper) => wrapper.id)).toEqual(
		model.wrappers.map((wrapper) => wrapper.id)
	);
	expect(result.document.voices.map((voice) => voice.id)).toEqual(
		model.voices.map((voice) => voice.id)
	);
});
