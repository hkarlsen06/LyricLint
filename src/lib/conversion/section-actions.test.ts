import { describe, expect, it } from 'vitest';
import {
	importDocument,
	renderProfile,
	resolveDecision,
	reconcileEdit,
	type ConversionAction,
	type ConversionDocument,
	type EngineResult
} from './index.js';

function value<T>(result: EngineResult<T>): T {
	if (!result.ok) throw Error(result.refusal.message);
	return result.value;
}

function imported(text: string): ConversionDocument {
	return value(importDocument({ text, profile: 'genius', language: 'en' }));
}

describe('section boundary actions', () => {
	it.each(['[Verse: Mira]\nOne\n[Chorus: Mira, Noor]\nTwo', '[Verse]\nOne\n[Chorus: Mira]\nTwo'])(
		'refuses a merge that would add a destination default voice to existing lyrics: %j',
		(source) => {
			const document = imported(source);
			const before = structuredClone(document);
			const result = resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
				kind: 'removeSection',
				sectionId: document.sections[0]!.id,
				targetSectionId: document.sections[1]!.id
			});
			expect(result.ok).toBe(false);
			expect(document).toEqual(before);
		}
	);

	it.each(['\n', '\r\n'] as const)(
		'separates a terminal heading when merging it before lyrics with %j',
		(eol) => {
			const document = imported(`[Verse]${eol}One${eol}[Chorus]`);
			const merged = value(
				resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
					kind: 'removeSection',
					sectionId: document.sections[0]!.id,
					targetSectionId: document.sections[1]!.id
				})
			).document;
			expect(value(renderProfile(merged, 'genius')).text).toBe(`[Chorus]${eol}One${eol}`);
			expect(merged.sections[0]!.id).toBe(document.sections[1]!.id);
		}
	);

	it('separates a terminal heading moved to an earlier line', () => {
		const document = imported('[Verse]\nOne\n[Chorus]');
		const moved = value(
			resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
				kind: 'moveSection',
				sectionId: document.sections[1]!.id,
				at: 0
			})
		).document;
		expect(value(renderProfile(moved, 'genius')).text).toBe('[Verse]\n[Chorus]\nOne\n');
	});

	it('keeps a partially edited destination and its literal bytes in place until repaired', () => {
		const document = imported('[Verse]\nOne\n[Chorus]\nTwo');
		const projection = value(renderProfile(document, 'genius'));
		const from = projection.text.indexOf('[Chorus]');
		const edited = value(
			reconcileEdit(document, projection, { changes: [{ from, to: from + 1, insert: '' }] })
		).document;
		const before = structuredClone(edited);
		const result = resolveDecision(edited, value(renderProfile(edited, 'musixmatch')), {
			kind: 'removeSection',
			sectionId: edited.sections[0]!.id,
			targetSectionId: edited.sections[1]!.id
		});
		expect(result.ok).toBe(false);
		expect(edited).toEqual(before);
		expect(value(renderProfile(edited, 'genius')).text).toBe('[Verse]\nOne\nChorus]\nTwo');
	});

	it.each(['genius', 'musixmatch'] as const)(
		'merges a middle section into the next while preserving its lyrics and retained records in %s',
		(profile) => {
			const document = imported(
				'[Intro]\nBefore\n[Verse]\nOne [silver <i></i> moon](123456)\n[Chorus]\nTwo\n[Outro]\nAfter'
			);
			document.lines[1]!.time = 4;
			const source = document.sections[1]!;
			const destination = document.sections[2]!;
			const before = structuredClone(document);
			const merged = value(
				resolveDecision(document, value(renderProfile(document, profile)), {
					kind: 'removeSection',
					sectionId: source.id,
					targetSectionId: destination.id
				})
			);
			expect(merged.document.sections[1]).toEqual({
				...destination,
				at: source.at,
				order: source.order
			});
			expect(value(renderProfile(merged.document, 'genius')).text).toBe(
				'[Intro]\nBefore\n[Chorus]\nOne [silver <i></i> moon](123456)\nTwo\n[Outro]\nAfter'
			);
			expect(merged.document.content).toBe(document.content);
			expect(merged.document.lines).toEqual(document.lines);
			expect(merged.document.wrappers).toEqual(document.wrappers);
			expect(merged.document.owners).toEqual(document.owners);
			expect(merged.document.voices).toEqual(document.voices);
			expect(document).toEqual(before);
		}
	);

	it.each(['next', 'previous'] as const)(
		'keeps matching performer assignments and the chosen heading when merging %s',
		(direction) => {
			const document = imported('[Verse: Mira]\nOne\n[Chorus: Mira]\nTwo');
			const source = document.sections[direction === 'next' ? 0 : 1]!;
			const destination = document.sections[direction === 'next' ? 1 : 0]!;
			const merged = value(
				resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
					kind: 'removeSection',
					sectionId: source.id,
					targetSectionId: destination.id
				})
			).document;
			expect(merged.sections).toHaveLength(1);
			expect(merged.sections[0]!.at).toBe(0);
			expect(merged.sections[0]!.id).toBe(destination.id);
			expect(value(renderProfile(merged, 'genius')).text).toBe(destination.header + 'One\nTwo');
			expect(merged.voices).toEqual(
				document.voices.map((voice) => ({ ...voice, sectionId: destination.id }))
			);
		}
	);

	it('updates the surviving empty section after merging lyrics into it', () => {
		const document = imported('[Intro]\n[Verse]\nWords');
		const merged = value(
			resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
				kind: 'removeSection',
				sectionId: document.sections[1]!.id,
				targetSectionId: document.sections[0]!.id
			})
		).document;
		expect(merged.sections[0]!.explicitEmpty).toBe(false);
		expect(value(renderProfile(merged, 'genius')).text).toBe('[Intro]\nWords');
	});

	it.each([
		{ kind: 'moveSection', sectionId: 'section:2', at: 4 },
		{ kind: 'moveSection', sectionId: 'section:2', at: 13 }
	] satisfies ConversionAction[])(
		'refuses a boundary change that would misrepresent existing voice ownership: %j',
		(action) => {
			const document = imported('[Verse: Mira]\nOne\nTwo\n[Chorus: Noor]\nThree');
			const before = structuredClone(document);
			const result = resolveDecision(
				document,
				value(renderProfile(document, 'musixmatch')),
				action
			);
			expect(result.ok).toBe(false);
			if (result.ok) throw Error('Expected a refusal');
			expect(result.refusal.message).toMatch(/voice/iu);
			expect(document).toEqual(before);
		}
	);

	it.each([
		[4, '[Verse: Mira]\nOne\n[Bridge: Mira]\nTwo\n[Chorus: Noor]\nThree'],
		[8, '[Verse: Mira]\nOne\nTwo\n[Chorus: Noor]\n[Bridge: Noor]\nThree']
	] as const)('inherits the existing voice when inserting a section at %i', (at, expected) => {
		const document = imported('[Verse: Mira]\nOne\nTwo\n[Chorus: Noor]\nThree');
		const inserted = value(
			resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
				kind: 'insertSection',
				at,
				type: 'Bridge'
			})
		).document;
		expect(value(renderProfile(inserted, 'genius')).text).toBe(expected);
		expect(inserted.voices.map((voice) => voice.rawNameText)).toEqual(
			at === 4 ? ['Mira', 'Mira', 'Noor'] : ['Mira', 'Noor']
		);
		expect(inserted.voices[0]!.id).toBe(document.voices[0]!.id);
		expect(inserted.voices.at(-1)!.id).toBe(document.voices.at(-1)!.id);
	});

	it('refuses a missing merge destination without removing anything', () => {
		const document = imported('[Verse]\nOne\n[Chorus]\nTwo');
		const before = structuredClone(document);
		const result = resolveDecision(document, value(renderProfile(document, 'musixmatch')), {
			kind: 'removeSection',
			sectionId: document.sections[0]!.id,
			targetSectionId: 'missing'
		});
		expect(result.ok).toBe(false);
		expect(document).toEqual(before);
	});
});
