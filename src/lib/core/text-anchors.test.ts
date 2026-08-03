import { describe, expect, it } from 'vitest';
import { resolveAnchor } from './text-anchors.js';

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
});
