import { describe, expect, it } from 'vitest';
import { anchoredPosition } from './anchored-position.js';

function anchorAt(top: number, height = 20) {
	return { left: 40, right: 120, top, bottom: top + height, width: 80, height };
}

describe('anchoredPosition', () => {
	it('hangs below a range with room under it', () => {
		const style = anchoredPosition(anchorAt(10));
		expect(style).toContain('top: 36px;');
		expect(style).not.toContain('bottom:');
	});

	it('flips above a range near the bottom of the window', () => {
		const style = anchoredPosition(anchorAt(window.innerHeight - 30));
		expect(style).toContain('bottom:');
		expect(style).not.toContain('top:');
	});

	it('leaves the horizontal clamp to CSS so the card cannot run off the right', () => {
		expect(anchoredPosition(anchorAt(10))).toContain('var(--ll-card-width)');
	});
});
