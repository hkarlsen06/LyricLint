import { describe, expect, it } from 'vitest';
import { escapeLegendText, serializeLegend, wrapVoiceSpan } from './genius-markup.js';

describe('Genius performer serialization', () => {
	it('serializes the documented four-group legend exactly', () => {
		expect(
			serializeLegend([
				{ styleSlot: 1, members: ['A'] },
				{ styleSlot: 2, members: ['B'] },
				{ styleSlot: 3, members: ['A', 'B'] },
				{ styleSlot: 4, members: ['C'] }
			])
		).toBe('A, <i>B</i>, <b>A & B</b> & <i><b>C</b></i>');
	});

	it('escapes performer text while keeping generated member separators semantic', () => {
		expect(escapeLegendText(`A <B> & "C's"`)).toBe('A &lt;B&gt; &amp; &quot;C&#39;s&quot;');
		expect(serializeLegend([{ styleSlot: 2, members: ['Echo & The Glass', 'A <B>'] }])).toBe(
			'<i>Echo &amp; The Glass & A &lt;B&gt;</i>'
		);
	});

	it('wraps all four slots', () => {
		expect([1, 2, 3, 4].map((slot) => wrapVoiceSpan('A', slot as 1 | 2 | 3 | 4))).toEqual([
			'A',
			'<i>A</i>',
			'<b>A</b>',
			'<i><b>A</b></i>'
		]);
	});
});
