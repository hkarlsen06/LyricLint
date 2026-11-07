import { describe, expect, it } from 'vitest';
import {
	importDocument,
	planProfileSwitch,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	type ConversionDocument,
	type EngineResult
} from './index.js';
import { createConversionEnvelope, parseConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { pasteDocument, sliceDocument } from './clipboard.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(result.refusal.message);
	return result.value;
}

function imported(text: string, language = 'en', profile: 'genius' | 'musixmatch' = 'genius') {
	return value(importDocument({ text, profile, language }));
}

describe('automatic English backing-vocal case', () => {
	it('lowercases the reported ordinary parenthetical word without changing the rest of the line', () => {
		const text = 'With 2 old tickets and a folded map (Whatever)';
		const original = imported(text);
		const before = JSON.stringify(original);
		const next = value(planProfileSwitch(original, { from: 'genius', to: 'musixmatch' }));
		expect(next.projection.text).toBe('With 2 old tickets and a folded map (whatever)');
		expect(value(renderProfile(next.document, 'genius')).text).toBe(text);
		expect(JSON.stringify(original)).toBe(before);
	});

	it('converts ordinary vocalizations and restores the exact Genius wording across repeated switches', () => {
		const text = '[Verse: Mira]\nStay with me (Yeah)\nI am here (Oh yes I am)\nSing (Ooh)';
		const original = imported(text);
		const before = JSON.stringify(original);
		for (let cycle = 0; cycle < 50; cycle++) {
			const next = value(planProfileSwitch(original, { from: 'genius', to: 'musixmatch' }));
			expect(next.projection.text).toBe('Stay with me (yeah)\nI am here (oh yes I am)\nSing (ooh)');
			expect(
				value(planProfileSwitch(next.document, { from: 'musixmatch', to: 'genius' })).projection
					.text
			).toBe(text);
			expect(next.document).toBe(original);
		}
		expect(JSON.stringify(original)).toBe(before);
	});

	it.each([
		'Keep going (I know)',
		'Keep going (Oh Mary)',
		'Keep going (NASA)',
		'Keep going. (Yeah)',
		'(Yeah) keep going',
		'Keep going (Oh. Yeah)',
		'Keep going (Oh (yeah))'
	])('preserves grammatical, named and uncertain cases: %s', (text) => {
		expect(value(renderProfile(imported(text), 'musixmatch')).text).toBe(text);
	});

	it('respects the source profile, passage language and explicit target spelling', () => {
		const text = 'Stay with me (Yeah)';
		for (const language of ['fr', 'de', 'ja', 'xx'])
			expect(value(renderProfile(imported(text, language), 'musixmatch')).text).toBe(text);
		expect(value(renderProfile(imported(text, 'en', 'musixmatch'), 'musixmatch')).text).toBe(text);
		const source = imported(text);
		const projection = value(renderProfile(source, 'genius'));
		const start = text.indexOf('Yeah');
		const frenchPassage = value(
			resolveDecision(source, projection, {
				kind: 'setPassageLanguage',
				range: { from: start, to: start + 4 },
				language: 'fr'
			})
		);
		expect(value(renderProfile(frenchPassage.document, 'musixmatch')).text).toBe(text);
		const deliberate = value(
			resolveDecision(source, projection, {
				kind: 'setForm',
				range: { from: start, to: start + 4 },
				profile: 'musixmatch',
				text: 'Yeah'
			})
		);
		expect(value(renderProfile(deliberate.document, 'musixmatch')).text).toBe(text);
	});

	it('preserves an old saved Musixmatch draft until a deliberate switch adopts the current renderer', () => {
		const text = '[Verse]\nStay with me (Yeah)';
		const original: ConversionDocument = { ...imported(text), converterVersion: '1' };
		const before = JSON.stringify(original);
		const saved = createConversionEnvelope(original, 'musixmatch', profilePolicyVersions);
		expect(saved.projectionText).toBe('Stay with me (Yeah)');
		const restored = parseConversionEnvelope(
			JSON.parse(JSON.stringify(saved)),
			saved.projectionText
		);
		expect(restored).toEqual(saved);
		expect(
			value(planProfileSwitch(restored.model, { from: 'musixmatch', to: 'musixmatch' })).document
		).toEqual(original);
		const genius = value(planProfileSwitch(restored.model, { from: 'musixmatch', to: 'genius' }));
		expect(genius.projection.text).toBe(text);
		const next = value(planProfileSwitch(genius.document, { from: 'genius', to: 'musixmatch' }));
		expect(next.document.converterVersion).toBe('3');
		expect(next.projection.text).toBe('Stay with me (yeah)');
		expect(next.document.nextId).toBe(original.nextId);
		expect(next.document.content).toBe(original.content);
		const current = createConversionEnvelope(next.document, 'musixmatch', profilePolicyVersions);
		expect(
			parseConversionEnvelope(JSON.parse(JSON.stringify(current)), next.projection.text)
		).toEqual(current);
		expect(value(renderProfile(next.document, 'genius')).text).toBe(text);
		expect(JSON.stringify(original)).toBe(before);
	});

	it('keeps an untouched converted vocalization exact when a neighboring edit removes its eligibility', () => {
		const source = imported('[Verse]\nSing (Yeah)');
		const projection = value(renderProfile(source, 'musixmatch'));
		const edited = value(
			reconcileEdit(source, projection, { changes: [{ from: 0, to: 5, insert: '' }] })
		);
		expect(edited.projection.text).toBe('(yeah)');
		expect(value(renderProfile(edited.document, 'genius')).text).toBe('[Verse]\n(Yeah)');
		const saved = createConversionEnvelope(edited.document, 'musixmatch', profilePolicyVersions);
		expect(parseConversionEnvelope(JSON.parse(JSON.stringify(saved)), '(yeah)')).toEqual(saved);
	});

	it('keeps carrying clipboard text exact across saved renderer versions', () => {
		for (const sourceVersion of ['1', '2', '3'] as const)
			for (const targetVersion of ['1', '2', '3'] as const)
				for (const at of [0, 5, 10]) {
					const source = { ...imported('Sing (Yeah) (Whatever)'), converterVersion: sourceVersion };
					const projection = value(renderProfile(source, 'musixmatch'));
					const fragment = value(
						sliceDocument(source, projection, { from: 0, to: projection.text.length })
					);
					const target = { ...imported('Left Right'), converterVersion: targetVersion };
					const pasted = value(
						pasteDocument(
							target,
							value(renderProfile(target, 'musixmatch')),
							{ from: at, to: at },
							fragment,
							'musixmatch'
						)
					);
					expect(pasted.projection.text).toBe(
						'Left Right'.slice(0, at) + projection.text + 'Left Right'.slice(at)
					);
				}
	});

	it.each(['1', '2'] as const)(
		'keeps saved renderer %s exact before adopting grammatical-word case',
		(version) => {
			const text = 'With 2 old tickets and a folded map (Whatever)';
			const legacy = { ...imported(text), converterVersion: version };
			const saved = createConversionEnvelope(legacy, 'musixmatch', profilePolicyVersions);
			expect(saved.projectionText).toBe(text);
			const restored = parseConversionEnvelope(JSON.parse(JSON.stringify(saved)), text);
			expect(restored).toEqual(saved);
			const genius = value(planProfileSwitch(restored.model, { from: 'musixmatch', to: 'genius' }));
			const next = value(planProfileSwitch(genius.document, { from: 'genius', to: 'musixmatch' }));
			expect(next.document.converterVersion).toBe('3');
			expect(next.projection.text).toBe('With 2 old tickets and a folded map (whatever)');
			expect(value(renderProfile(next.document, 'genius')).text).toBe(text);
		}
	);
});
