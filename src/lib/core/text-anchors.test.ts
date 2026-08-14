import { describe, expect, it } from 'vitest';
import { occurrenceAt, resolveAnchor } from './text-anchors.js';

describe('text anchors', () => {
	it('resolves a unique exact occurrence', () => {
		expect(
			resolveAnchor('[Verse]\nHold on tight', { exact: 'Hold on', before: '', after: '' })
		).toEqual({ ok: true, from: 8, to: 15 });
	});

	it('reports a missing exact occurrence', () => {
		expect(resolveAnchor('Hold on', { exact: 'Let go', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('reports repeated text as ambiguous without enough context', () => {
		expect(resolveAnchor('Stay\nStay\nStay', { exact: 'Stay', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'ambiguous'
		});
	});

	it('uses exact adjacent context to disambiguate repeated text', () => {
		const document = '[Verse]\nStay\n\n[Chorus]\nStay\nTonight';
		expect(
			resolveAnchor(document, {
				exact: 'Stay',
				before: '[Chorus]\n',
				after: '\nTonight'
			})
		).toEqual({ ok: true, from: 23, to: 27 });
	});

	it('reports ambiguous when context picks none of several occurrences', () => {
		expect(resolveAnchor('Stay\nStay', { exact: 'Stay', before: 'Never ', after: '' })).toEqual({
			ok: false,
			reason: 'ambiguous'
		});
	});

	it('separates identical repeated copies by line number, which context cannot', () => {
		// The shape a linked chorus produces: three copies whose neighbouring
		// lines are identical too, so before/after picks all three or none.
		const document =
			'[Chorus]\nBap, bap\nStay\n\n[Chorus]\nBap, bap\nStay\n\n[Chorus]\nBap, bap\nStay';
		expect(
			resolveAnchor(document, {
				exact: 'Bap, bap',
				before: '[Chorus]\n',
				after: '\nStay',
				line: 6
			})
		).toEqual({ ok: true, from: 33, to: 41 });
	});

	it('falls back to context when the line number narrows to nothing', () => {
		const document = '[Verse]\nStay\n\n[Chorus]\nStay\nTonight';
		expect(
			resolveAnchor(document, {
				exact: 'Stay',
				before: '[Chorus]\n',
				after: '\nTonight',
				line: 99
			})
		).toEqual({ ok: true, from: 23, to: 27 });
	});

	it('uses context within the named line when the text repeats along it', () => {
		const document = 'stay, stay\nstay, stay';
		expect(
			resolveAnchor(document, { exact: 'stay', before: 'stay, ', after: '', line: 2 })
		).toEqual({ ok: true, from: 17, to: 21 });
	});

	it('ignores wrong context beside a unique occurrence: exact text already pins it', () => {
		expect(resolveAnchor('A\nHold on', { exact: 'Hold on', before: 'A ', after: '' })).toEqual({
			ok: true,
			from: 2,
			to: 9
		});
	});

	it('does not normalize whitespace in exact text', () => {
		expect(resolveAnchor('Hold  on', { exact: 'Hold on', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('resolves the one zero-width range in an empty document', () => {
		expect(resolveAnchor('', { exact: '', before: '', after: '', line: 1 })).toEqual({
			ok: true,
			from: 0,
			to: 0
		});
	});

	it('rejects an empty exact anchor in a non-empty document instead of matching every offset', () => {
		expect(resolveAnchor('Anything', { exact: '', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	describe('the occurrence pin', () => {
		// The failure this exists for: three verses opening on the same line, and
		// a batch of proposals that put a header above each. Applying the first
		// moves every line below it, so the second proposal's line number
		// narrows to nothing and its context — the identical neighbours of a
		// repeat — cannot separate the copies.
		const song = [
			'Sweep me under the rug',
			'',
			'Sweep me under the rug',
			'',
			'Sweep me under the rug'
		].join('\n');
		const anchor = (line: number) => ({
			exact: 'Sweep me under the rug',
			before: '',
			after: '',
			line
		});

		it('names which copy an anchor landed on', () => {
			expect(occurrenceAt(song, 'Sweep me under the rug', 24)).toEqual({ index: 1, total: 3 });
		});

		it('names no copy for an offset that is not one, or for empty exact', () => {
			expect(occurrenceAt(song, 'Sweep me under the rug', 5)).toBeUndefined();
			expect(occurrenceAt(song, '', 0)).toBeUndefined();
		});

		it('resolves the pinned copy after an earlier edit moved its line', () => {
			const shifted = `[Verse 1]\n\n${song}`;
			expect(resolveAnchor(shifted, anchor(3), { index: 1, total: 3 })).toEqual({
				ok: true,
				from: 35,
				to: 57
			});
			// The same anchor without its pin is the bug, in both of the shapes it
			// takes: a stale line that now names a different copy resolves to the
			// wrong place, and one that names no copy at all falls back to context
			// the copies share and is refused.
			expect(resolveAnchor(shifted, anchor(3))).toEqual({ ok: true, from: 11, to: 33 });
			expect(resolveAnchor(shifted, anchor(4))).toEqual({ ok: false, reason: 'ambiguous' });
		});

		it('falls back to the line where the copies have been added to or removed', () => {
			// A pin is only the k-th copy for as long as there are the same
			// number of copies; a changed total means it no longer names a place.
			expect(resolveAnchor(song, anchor(3), { index: 1, total: 4 })).toEqual({
				ok: true,
				from: 24,
				to: 46
			});
		});

		it('outranks a line number that names a different copy', () => {
			expect(resolveAnchor(song, anchor(1), { index: 2, total: 3 })).toEqual({
				ok: true,
				from: 48,
				to: 70
			});
		});
	});
});
