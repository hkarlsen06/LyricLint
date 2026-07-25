import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';
import type { Severity } from '$lib/core/types.js';
import SeverityIcon from './SeverityIcon.svelte';

const SEVERITIES: Severity[] = ['error', 'warning', 'suggestion', 'manual-review'];

/** Every shape the glyph draws, in order, with nothing about its color. */
function outline(severity: Severity): string {
	const screen = render(SeverityIcon, { severity });
	const shapes = [...screen.container.querySelectorAll('path, circle, rect, polygon')].map(
		(shape) => `${shape.tagName}:${shape.getAttribute('d') ?? ''}${shape.getAttribute('r') ?? ''}`
	);
	screen.unmount();
	return shapes.join(' ');
}

describe('the severity glyph', () => {
	it('draws a different mark for every severity', () => {
		// The meta line dropped the severity word, so this glyph is the whole of the
		// severity there. Two severities drawing the same shape would leave color as
		// the only thing separating them, which is the one thing a severity may not
		// be carried by alone. Error was `!` in a circle and suggestion `i` in one —
		// the same ring with the bar and the dot swapped, a coin flip at 12px.
		const outlines = SEVERITIES.map(outline);
		expect(new Set(outlines).size).toBe(SEVERITIES.length);
	});

	it('takes its color from whatever it sits in, and says nothing to a screen reader', () => {
		// The chip and the diagnostic row wear the same mark in two different
		// colors, and the word beside it is what gets announced.
		const screen = render(SeverityIcon, { severity: 'warning' });
		const icon = screen.container.querySelector('.severity-icon')!;
		expect(icon.getAttribute('stroke')).toBe('currentColor');
		expect(icon.getAttribute('aria-hidden')).toBe('true');
		screen.unmount();
	});
});
