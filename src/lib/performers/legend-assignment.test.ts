import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic } from '$lib/core/types.js';
import { resolveLegendAssignment } from './legend-assignment.js';

/** The diagnostic `performer.inline-mismatch` reports over a styled span. */
function mismatch(text: string, styled: string, overrides: Partial<Diagnostic> = {}): Diagnostic {
	const from = text.indexOf(styled);
	if (from < 0) {
		throw new Error(`Fixture does not contain ${styled}`);
	}
	return {
		ruleId: 'performer.inline-mismatch',
		severity: 'warning',
		from,
		to: from + styled.length,
		message: 'Inline style has no performer in the section legend.',
		explanation: 'The styled lyric is preserved as an unresolved voice.',
		sourceIds: [],
		...overrides
	};
}

function resolve(text: string, styled: string, overrides: Partial<Diagnostic> = {}) {
	return resolveLegendAssignment(parseDocument(text), mismatch(text, styled, overrides));
}

describe('resolveLegendAssignment', () => {
	it('targets the styled slot when the section also has plain lyrics', () => {
		const text = '[Verse: Avery]\nAvery leads\n<i>Blair answers</i>';

		expect(resolve(text, '<i>Blair answers</i>')).toEqual({
			status: 'available',
			target: { sectionFrom: 0, styleSlot: 2 }
		});
	});

	it('promotes the styled slot to plain when nothing in the section is plain', () => {
		const text = '[Verse]\n<i>Blair sings</i>';

		expect(resolve(text, '<i>Blair sings</i>')).toEqual({
			status: 'available',
			target: { sectionFrom: 0, styleSlot: 2, promoteToPlain: true }
		});
	});

	it('blocks a styled-only section that uses two styles', () => {
		// Promoting one of them still leaves the other ahead of a slot nothing
		// fills, which is the very ordering `performer.style-order` reports.
		const text = '[Verse]\n<i>Blair sings</i>\n<b>Avery answers</b>';

		expect(resolve(text, '<i>Blair sings</i>')).toEqual({
			status: 'unavailable',
			reason: 'needs-plain-lyrics'
		});
	});

	it('blocks a section with no header to hold a legend', () => {
		const text = '<i>Blair sings</i>';

		expect(resolve(text, '<i>Blair sings</i>')).toEqual({
			status: 'unavailable',
			reason: 'no-header'
		});
	});

	it('ignores diagnostics from other rules', () => {
		const text = '[Verse]\n<i>Blair sings</i>';

		expect(resolve(text, '<i>Blair sings</i>', { ruleId: 'performer.style-order' })).toEqual({
			status: 'unavailable',
			reason: 'not-applicable'
		});
	});
});
