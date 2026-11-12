import { expect, it } from 'vitest';
import {
	importDocument,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	type ConversionDocument,
	type EngineResult
} from './index.js';
import { validateModel } from './validation.js';
import { pasteDocument } from './clipboard.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`);
	return result.value;
}
function freeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.freeze(value);
		for (const entry of Object.values(value)) freeze(entry);
	}
	return value;
}

it('keeps every single-boundary edit exact across retained syntax, CRLF, Unicode and transformed units', () => {
	const fixtures: ConversionDocument[] = [
		value(
			importDocument({
				text: ' [Verse: Mira & <i>Noor</i>] \r\n<i>[A 🌙](000123)</i>\r\n\r\n[Chorus]\r\nB',
				profile: 'genius',
				language: 'en'
			})
		),
		value(
			importDocument({
				text: '[Couplet]\nPourquoi ?\n<i>Et toi ?!</i>',
				profile: 'genius',
				language: 'fr'
			})
		),
		value(importDocument({ text: '[Verse]\n[Chorus]\n[Outro]', profile: 'genius', language: 'en' }))
	];
	const number = value(
		importDocument({ text: '[Verse]\n2 stars', profile: 'genius', language: 'en' })
	);
	fixtures.push(
		value(
			resolveDecision(number, value(renderProfile(number, 'musixmatch')), {
				kind: 'setForm',
				range: { from: 0, to: 1 },
				profile: 'musixmatch',
				text: 'two'
			})
		).document
	);
	const french = value(
		importDocument({ text: '[Couplet]\nPourquoi ?\n', profile: 'genius', language: 'fr' })
	);
	const frenchView = value(renderProfile(french, 'musixmatch'));
	const exception = value(
		importDocument({ text: 'Et toi ?', profile: 'musixmatch', language: 'fr' })
	);
	fixtures.push(
		value(
			pasteDocument(
				french,
				frenchView,
				{ from: frenchView.text.length, to: frenchView.text.length },
				exception,
				'musixmatch'
			)
		).document
	);
	for (const [fixture, source] of fixtures.entries()) {
		freeze(source);
		for (const profile of ['genius', 'musixmatch'] as const) {
			const projection = value(renderProfile(source, profile));
			for (let from = 0; from <= projection.text.length; from++) {
				for (const [length, insert] of [
					[0, '🌙'],
					[0, '\n'],
					[1, ''],
					[2, '[']
				] as const) {
					const to = Math.min(projection.text.length, from + length);
					const result = reconcileEdit(source, projection, {
						changes: [{ from, to, insert }],
						mirror: false
					});
					expect(result.ok, JSON.stringify({ fixture, profile, from, to, insert, result })).toBe(
						true
					);
					if (!result.ok) continue;
					const expected = projection.text.slice(0, from) + insert + projection.text.slice(to);
					expect(result.value.projection.text).toBe(expected);
					const stored = JSON.stringify(result.value.document);
					value(
						renderProfile(result.value.document, profile === 'genius' ? 'musixmatch' : 'genius')
					);
					expect(value(renderProfile(result.value.document, profile)).text).toBe(expected);
					expect(JSON.stringify(result.value.document)).toBe(stored);
				}
			}
		}
	}
});

it('rejects hidden lyric text masquerading as a header or Musixmatch wrapper at rich-data boundaries', () => {
	const model = value(importDocument({ text: '[Verse]\n[Moon](123)', profile: 'genius' }));
	expect(
		validateModel({
			...model,
			sections: model.sections.map((section) => ({
				...section,
				header: '[Verse]\nHidden lyrics\n'
			}))
		}).ok
	).toBe(false);
	expect(
		validateModel({
			...model,
			sections: model.sections.map((section) => ({ ...section, header: '[unfinished' }))
		}).ok
	).toBe(false);
	expect(
		validateModel({
			...model,
			wrappers: model.wrappers.map((wrapper) => ({ ...wrapper, profile: 'musixmatch' }))
		}).ok
	).toBe(false);
});
