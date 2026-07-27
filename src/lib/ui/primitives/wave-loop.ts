/**
 * The brand mark's waveform, with a phase — the running curve behind every
 * indeterminate loading mark in the application.
 *
 * The mark's own wave is a quadratic approximation of a sine over `2` to `30` in
 * its 32-unit viewBox. Computing that sine instead lets it move: the phase is one
 * number in the expression, and at phase 0 the result *is* the mark, within 0.27
 * units at its worst — about a third of a pixel at the size a boot screen draws
 * it. So nothing has to transition into the animation or out of it.
 *
 * The alternative, and the reason this is worth a module of its own, was to
 * animate the phase by translating a longer path. That needs the path swapped for
 * one several periods wide, which fills the viewBox instead of stopping short of
 * it, which cuts the wave's round caps off at the clip edge, which needs a mask,
 * which needs an `@property` to animate the mask, which needs a beat to fade it
 * in before the swap lands underneath. Six mechanisms, each one holding up the
 * one before it. The span is fixed here, so the ends never move and there is
 * nothing to hide.
 */

/** The horizontal span of the mark's wave, and the line it oscillates about. */
const WAVE_FROM = 2;
const WAVE_TO = 30;
const WAVE_MID = 16;
/** The peak deviation of `M2 16Q9 6.7 16 16T30 16`. */
const WAVE_PEAK = 4.65;

/** One wavelength per this long. */
export const WAVE_PERIOD_MS = 950;

/** The wave at a given phase, in wavelengths. Whole numbers are the mark itself. */
export function wavePath(phase: number): string {
	const span = WAVE_TO - WAVE_FROM;
	let path = '';
	for (let x = WAVE_FROM; x <= WAVE_TO; x += 1) {
		const y = WAVE_MID - WAVE_PEAK * Math.sin(2 * Math.PI * ((x - WAVE_FROM) / span + phase));
		path += `${path ? 'L' : 'M'}${x} ${y.toFixed(2)}`;
	}
	return path;
}

export interface WaveLoopOptions {
	/**
	 * A multiplier on the clock. Reduced motion slows the wave rather than
	 * stopping it: a still wave reads as a drawing, and it is usually the only
	 * thing on screen reporting that anything is happening.
	 */
	rate?: number;
}

/**
 * Runs the wave on an existing path, and puts the path's own `d` back when it
 * stops.
 *
 * It writes the `d` **attribute** rather than the CSS `d` property. That property
 * exists only in Blink, and behind an `@supports` it once silently cost WebKit
 * the entire animation while leaving something plausible enough on screen to ship.
 * As an attribute it is as old as SVG. A curve with a phase in it is not
 * something a keyframe could state anyway.
 *
 * It runs until it is stopped, and does not stop itself. There was a run-out
 * here once — on the answer arriving it would carry on to the next whole
 * wavelength, where the curve is the mark again, so that the wave was never left
 * frozen mid-stride. That is worth nothing to a caller whose exit takes the wave
 * away rather than leaving it standing: the boot screen closes the brackets over
 * it and squeezes it out from both edges, so where the phase happened to be is
 * not on screen long enough to be anywhere. It cost up to a whole wavelength of
 * held-back workspace to buy a frame nobody sees.
 *
 * @returns a function that stops the loop and restores the path.
 */
export function runWave(path: SVGPathElement, options: WaveLoopOptions = {}): () => void {
	const { rate = 1 } = options;
	const own = path.getAttribute('d');

	const started = performance.now();
	let frame = requestAnimationFrame(function draw(now) {
		path.setAttribute('d', wavePath(((now - started) * rate) / WAVE_PERIOD_MS));
		frame = requestAnimationFrame(draw);
	});

	return () => {
		cancelAnimationFrame(frame);
		if (own !== null) path.setAttribute('d', own);
	};
}
