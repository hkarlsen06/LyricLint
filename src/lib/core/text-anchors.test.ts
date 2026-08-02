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

	it('reports not-found when supplied context matches no occurrence', () => {
		expect(resolveAnchor('Stay\nStay', { exact: 'Stay', before: 'Never ', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('does not normalize whitespace in exact text or context', () => {
		expect(resolveAnchor('Hold  on', { exact: 'Hold on', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
		expect(resolveAnchor('A\nHold on', { exact: 'Hold on', before: 'A ', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('rejects an empty exact anchor instead of matching every offset', () => {
		expect(resolveAnchor('Anything', { exact: '', before: '', after: '' })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});
});
