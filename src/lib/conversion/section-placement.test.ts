import { describe, expect, it } from 'vitest';
import {
	importDocument,
	reconcileEdit,
	renderProfile,
	resolveDecision,
	type EngineResult
} from './index.js';
import { createConversionEnvelope, parseConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw Error(result.refusal.message);
	return result.value;
}
function imported(text: string) {
	return value(importDocument({ text, profile: 'genius', language: 'en' }));
}
describe('displaced retained headings', () => {
	it.each(['\n', '\r\n'])(
		'withholds an EOF heading after a whole visible replacement with %j',
		(eol) => {
			const original = imported(`[Verse]${eol}One${eol}[Instrumental]`);
			const edited = value(
				reconcileEdit(original, value(renderProfile(original, 'musixmatch')), {
					changes: [{ from: 0, to: original.content.length, insert: 'My new song' }]
				})
			);
			const genius = value(renderProfile(edited.document, 'genius'));
			expect(genius.text).toBe(`[Verse]${eol}My new song`);
			expect(genius.findings).toEqual([
				expect.objectContaining({ code: 'section-placement', recordId: original.sections[1]!.id })
			]);
			expect(genius.findings[0]!.range).toBeUndefined();
			expect(edited.document.sections[1]).toMatchObject({
				...original.sections[1],
				at: 11,
				placement: 'unresolved'
			});
			const envelope = createConversionEnvelope(edited.document, 'genius', profilePolicyVersions);
			expect(parseConversionEnvelope(JSON.parse(JSON.stringify(envelope)), genius.text)).toEqual(
				envelope
			);
			const repaired = value(
				resolveDecision(edited.document, genius, {
					kind: 'moveSection',
					sectionId: original.sections[1]!.id,
					at: 0
				})
			);
			expect(value(renderProfile(repaired.document, 'musixmatch')).text).toBe('My new song');
			expect(value(renderProfile(repaired.document, 'genius')).findings).toEqual([]);
		}
	);
	it.each(['by', 'by\nnew'])(
		'keeps a cross-section replacement exact, including repeated words: %j',
		(insert) => {
			const original = imported('[Verse: Mira]\n[One](123)\n[Chorus: Noor]\nTwo One');
			const edited = value(
				reconcileEdit(original, value(renderProfile(original, 'musixmatch')), {
					changes: [{ from: 1, to: 5, insert }]
				})
			);
			expect(edited.projection.text).toBe(`O${insert}wo One`);
			const genius = value(renderProfile(edited.document, 'genius'));
			expect(genius.text).not.toContain('[Chorus: Noor]');
			expect(edited.document.sections.map((s) => s.id)).toEqual(original.sections.map((s) => s.id));
			const again = value(
				reconcileEdit(edited.document, genius, {
					changes: [{ from: genius.text.length, to: genius.text.length, insert: '!' }]
				})
			);
			expect(again.document.sections.map((s) => s.id)).toEqual(original.sections.map((s) => s.id));
			expect(value(renderProfile(again.document, 'musixmatch')).text).toBe(`O${insert}wo One!`);
			expect(again.document.voices.map((v) => v.id)).toEqual(
				edited.document.voices.map((v) => v.id)
			);
		}
	);
	it.each(['[Verse]\n[Chorus]\n[Outro]', '[Verse]\r\nOne\r\n[Outro]', '[Verse]\nOne'])(
		'keeps valid, coincident and terminal headings exact: %j',
		(source) => {
			const model = imported(source);
			expect(value(renderProfile(model, 'genius')).text).toBe(source);
			expect(value(renderProfile(model, 'genius')).findings).toEqual([]);
		}
	);
	it('preserves partially typed literal headers through both projections', () => {
		const model = imported('[Verse]\nOne\n[Chorus]\nTwo');
		const genius = value(renderProfile(model, 'genius'));
		const from = genius.text.indexOf('[Chorus]');
		const edited = value(
			reconcileEdit(model, genius, { changes: [{ from, to: from + 1, insert: '' }] })
		);
		expect(edited.projection.text).toBe('[Verse]\nOne\nChorus]\nTwo');
		expect(value(renderProfile(edited.document, 'musixmatch')).text).toContain('Chorus]');
	});
	it('keeps links, nested annotations, voice assignments and timing records recoverable', () => {
		const model = value(
			importDocument({
				text: '[Verse: Mira]\n<i>[One](123)</i>\n[Chorus: Noor]\nTwo',
				profile: 'genius',
				language: 'en',
				lineAnchors: [
					{ line: 2, time: 1 },
					{ line: 4, time: 3 }
				],
				sectionLinks: [{ lines: [1, 3] }]
			})
		);
		const edited = value(
			reconcileEdit(model, value(renderProfile(model, 'musixmatch')), {
				changes: [{ from: 1, to: 5, insert: 'by' }],
				mirror: false
			})
		);
		expect(edited.document.links.map((link) => link.id)).toEqual(
			model.links.map((link) => link.id)
		);
		expect(edited.document.wrappers.map((wrapper) => wrapper.id)).toEqual(
			model.wrappers.map((wrapper) => wrapper.id)
		);
		expect(edited.document.voices.map((voice) => voice.id)).toEqual(
			model.voices.map((voice) => voice.id)
		);
		expect(edited.document.lines.some((line) => line.time === 1)).toBe(true);
		const checkpoint = structuredClone(edited.document);
		const projection = value(renderProfile(edited.document, 'genius'));
		for (let i = 0; i < 3; i++) {
			expect(value(renderProfile(edited.document, 'musixmatch')).text).toBe('Obywo');
			expect(value(renderProfile(edited.document, 'genius'))).toEqual(projection);
		}
		expect(edited.document).toEqual(checkpoint);
	});
	it('accepts compatible old rich data and refuses a saved malformed Genius projection', () => {
		const original = imported('[Verse]\nOne\n[Chorus]\nTwo');
		const envelope = createConversionEnvelope(original, 'genius', profilePolicyVersions);
		expect(
			parseConversionEnvelope({ ...envelope, converterVersion: '1' }, envelope.projectionText)
		).toEqual(envelope);
		original.sections[1]!.at = 1;
		expect(() =>
			parseConversionEnvelope({
				...envelope,
				model: original,
				projectionText: '[Verse]\nO[Chorus]\nne\nTwo'
			})
		).toThrow('do not match');
	});
});
