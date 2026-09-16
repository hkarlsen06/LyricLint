import { expect, it } from 'vitest';
import {
	importDocument,
	renderProfile,
	resolveDecision,
	updateMetadata,
	type EngineResult
} from './index.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

it.each(['genius', 'musixmatch'] as const)(
	'expands only a confirmed passage in %s with fresh untimed copies and exact retained first occurrence',
	(profile) => {
		let model = value(
			importDocument({
				text: '[Chorus]\n[Moon](000123) (×3)\nEnd',
				profile: 'genius',
				language: 'en'
			})
		);
		model = value(
			updateMetadata(model, value(renderProfile(model, 'genius')), {
				lineAnchors: [
					{ line: 2, time: 10 },
					{ line: 3, time: 30 }
				]
			})
		).document;
		const originalLine = model.lines[0]!.id;
		const lastLine = model.lines[1]!.id;
		const wrapper = model.wrappers[0]!.id;
		const projection = value(renderProfile(model, profile));
		const from = profile === 'genius' ? projection.text.indexOf('[Moon]') : 0;
		const to = projection.text.indexOf(' (×3)');
		const notation = { from: to + 1, to: to + 5 };
		const result = value(
			resolveDecision(model, projection, {
				kind: 'expandRepeat',
				passage: { from, to },
				notation,
				count: 3
			})
		);
		expect(value(renderProfile(result.document, 'musixmatch')).text).toBe('Moon\nMoon\nMoon\nEnd');
		expect(value(renderProfile(result.document, 'genius')).text).toBe(
			'[Chorus]\n[Moon](000123)\nMoon\nMoon\nEnd'
		);
		expect(result.document.wrappers.map((entry) => entry.id)).toEqual([wrapper]);
		expect(result.document.lines[0]!.id).toBe(originalLine);
		expect(result.document.lines[3]!.id).toBe(lastLine);
		expect(result.document.lines.slice(1, 3).map((line) => line.time)).toEqual([
			undefined,
			undefined
		]);
		expect(new Set(result.document.lines.map((line) => line.id)).size).toBe(4);
		expect(value(renderProfile(result.document, 'musixmatch')).lineAnchors).toEqual([
			{ line: 1, time: 10 },
			{ line: 4, time: 30 }
		]);
		const stored = JSON.stringify(result.document);
		for (let i = 0; i < 12; i++)
			for (const profile of ['genius', 'musixmatch'] as const)
				expect(renderProfile(result.document, profile).ok).toBe(true);
		expect(JSON.stringify(result.document)).toBe(stored);
	}
);

it('refuses guessed, clipped, crossing and excessive repeat scopes atomically', () => {
	const model = value(
		importDocument({ text: '[Verse]\n[Moon rises](123) (x3)', profile: 'genius' })
	);
	const projection = value(renderProfile(model, 'musixmatch'));
	const original = JSON.stringify(model);
	const action = {
		kind: 'expandRepeat' as const,
		passage: { from: 0, to: 10 },
		notation: { from: 11, to: 15 },
		count: 3
	};
	for (const variant of [
		{ ...action, passage: { from: 0, to: 4 } },
		{ ...action, count: 101 },
		{ ...action, count: 2.5 },
		{ ...action, notation: { from: 4, to: 8 } },
		{ ...action, passage: { from: 2, to: 10 } }
	])
		expect(resolveDecision(model, projection, variant).ok).toBe(false);
	expect(JSON.stringify(model)).toBe(original);
});

it('expands explicit same-line repeats without discovering notation elsewhere', () => {
	const model = value(
		importDocument({ text: 'Hey (repeat)\nLeave x3 alone', profile: 'musixmatch' })
	);
	const projection = value(renderProfile(model, 'musixmatch'));
	const result = value(
		resolveDecision(model, projection, {
			kind: 'expandRepeat',
			passage: { from: 0, to: 3 },
			notation: { from: 4, to: 12 },
			count: 4,
			separator: ' '
		})
	);
	expect(result.projection.text).toBe('Hey Hey Hey Hey\nLeave x3 alone');
	expect(value(renderProfile(result.document, 'genius')).text).toBe(result.projection.text);
});
