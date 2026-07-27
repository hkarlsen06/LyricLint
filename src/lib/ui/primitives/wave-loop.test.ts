import { describe, expect, it } from 'vitest';
import { wavePath } from './wave-loop.js';

/** The lockup's own wave, as `AppWordmark.svelte` draws it. */
const MARK = { from: 2, to: 30, mid: 16, peakAt: 9, peakY: 11.35 };

const points = (d: string) =>
	d
		.slice(1)
		.split('L')
		.map((pair) => pair.split(' ').map(Number))
		.map(([x, y]) => ({ x, y }));

describe('wavePath', () => {
	/**
	 * The span is the whole reason this is computed rather than translated. A wave
	 * that travels by sliding a longer path has to overrun its box and be clipped,
	 * so it widens and loses the round caps the mark ends in — visibly, on the
	 * frame the animation starts. Here the ends cannot move: they are not a
	 * function of the phase.
	 */
	it('spans exactly the mark, at every phase', () => {
		for (const phase of [0, 0.17, 0.5, 0.83, 1, 7.4]) {
			const drawn = points(wavePath(phase));
			expect(drawn.at(0)!.x).toBe(MARK.from);
			expect(drawn.at(-1)!.x).toBe(MARK.to);
		}
	});

	// Whole wavelengths are the same picture, which is what makes the loop seamless
	// and stopping on one invisible.
	it('repeats exactly every wavelength', () => {
		expect(wavePath(1)).toBe(wavePath(0));
		expect(wavePath(4)).toBe(wavePath(0));
		expect(wavePath(2.25)).toBe(wavePath(0.25));
	});

	/**
	 * And phase zero is the mark itself. The mark's path is a quadratic
	 * approximation of this sine, so the two are not identical — but they agree at
	 * the points that describe the curve, which is what lets the animation start
	 * and end without a transition into or out of it.
	 */
	it('is the mark at phase zero', () => {
		const drawn = points(wavePath(0));
		const at = (x: number) => drawn.find((point) => point.x === x)!.y;

		// Both zero crossings and the one in the middle.
		expect(at(MARK.from)).toBeCloseTo(MARK.mid, 1);
		expect(at(16)).toBeCloseTo(MARK.mid, 1);
		expect(at(MARK.to)).toBeCloseTo(MARK.mid, 1);
		// And the crest, where the mark's control point puts it.
		expect(at(MARK.peakAt)).toBeCloseTo(MARK.peakY, 1);
	});

	// It goes up first, like the mark. A sine of the wrong sign would satisfy
	// everything above and draw the brand upside down.
	it('crests before it troughs', () => {
		const drawn = points(wavePath(0));
		const at = (x: number) => drawn.find((point) => point.x === x)!.y;
		expect(at(9)).toBeLessThan(MARK.mid);
		expect(at(23)).toBeGreaterThan(MARK.mid);
	});
});
