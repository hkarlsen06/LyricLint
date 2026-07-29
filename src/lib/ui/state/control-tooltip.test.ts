import { describe, expect, it } from 'vitest';
import { placeControlHint } from './control-tooltip.svelte.js';

const viewport = { width: 1440, height: 900 };

/**
 * The two surfaces that name their controls want opposite answers on both axes,
 * and neither should have to say so: the action tray hangs at the top-right of
 * the document, where a box laid out leftward runs off the panel edge, and the
 * transport is the last row above the status bar, where there is nothing below.
 * So the placement is read off the control rather than passed in, and this is
 * the arithmetic that does it.
 */
describe('placeControlHint', () => {
	it('hangs below a control with room under it', () => {
		const style = placeControlHint(
			{ top: 56, bottom: 100, left: 200, right: 260, width: 60 },
			viewport
		);
		expect(style).toContain('top: 106px;');
		expect(style).not.toContain('bottom:');
	});

	it('flips above a control near the foot of the window', () => {
		// The transport: a `lg` row sitting on the status bar.
		const style = placeControlHint(
			{ top: 820, bottom: 856, left: 60, right: 96, width: 36 },
			viewport
		);
		expect(style).toContain('bottom: 86px;');
		expect(style).not.toContain('top:');
	});

	it('lays a box out from the edge it is nearest', () => {
		// The tray, against the right panel: laid out leftward it would run off.
		expect(
			placeControlHint({ top: 56, bottom: 100, left: 1000, right: 1040, width: 40 }, viewport)
		).toContain('right: 400px;');
		// A control in the left half keeps its left edge, so the box grows the way
		// the text in it reads.
		expect(
			placeControlHint({ top: 56, bottom: 100, left: 120, right: 160, width: 40 }, viewport)
		).toContain('left: 120px;');
	});

	it('never lets a box start off screen', () => {
		expect(
			placeControlHint({ top: 56, bottom: 100, left: -40, right: 10, width: 50 }, viewport)
		).toContain('left: 8px;');
		expect(
			placeControlHint({ top: 56, bottom: 100, left: 1430, right: 1480, width: 50 }, viewport)
		).toContain('right: 8px;');
	});
});
