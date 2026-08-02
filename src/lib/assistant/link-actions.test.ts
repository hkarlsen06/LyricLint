import { describe, expect, it } from 'vitest';
import { composeSectionLinks, resolveHeaderLine, resolveLinkAction } from './link-actions.js';

const DRAFT = [
	' [Chorus] ',
	'First copy',
	'[Verse]',
	'[Chorus]',
	'Second copy',
	'[Chorus 2]',
	'[Chorus] extra'
].join('\r\n');

describe('assistant section-link actions', () => {
	it('resolves exact trimmed header lines by their 1-based occurrence', () => {
		expect(resolveHeaderLine(DRAFT, { text: '[Chorus]', occurrence: 1 })).toBe(1);
		expect(resolveHeaderLine(DRAFT, { text: '  [Chorus] ', occurrence: 2 })).toBe(4);
		expect(resolveHeaderLine(DRAFT, { text: '[chorus]', occurrence: 1 })).toBeUndefined();
		expect(resolveHeaderLine(DRAFT, { text: '[Chorus]', occurrence: 3 })).toBeUndefined();
	});

	it('fails a whole action when any addressed member is missing', () => {
		const action = {
			id: 'a1',
			action: 'link' as const,
			headers: [
				{ text: '[Chorus]', occurrence: 1 },
				{ text: '[Chorus]', occurrence: 3 }
			],
			note: 'Repeated words.'
		};
		expect(resolveLinkAction(DRAFT, action)).toEqual({ ok: false, action, reason: 'not-found' });
	});

	it('resolves a complete action in the model-specified member order', () => {
		const action = {
			id: 'a1',
			action: 'link' as const,
			headers: [
				{ text: '[Chorus]', occurrence: 2 },
				{ text: '[Chorus]', occurrence: 1 }
			],
			note: 'Repeated words.'
		};
		expect(resolveLinkAction(DRAFT, action)).toEqual({ ok: true, action, headerLines: [4, 1] });
	});

	it('composes current groups with occurrences derived from the live draft', () => {
		expect(composeSectionLinks(DRAFT, [{ lines: [4, 1] }, { lines: [6, 99] }])).toEqual([
			'[Chorus] occurrence 1 ↔ [Chorus] occurrence 2'
		]);
	});
});
