import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BootScreen from './BootScreen.svelte';

/**
 * Parks the component on its reduced-motion path, where the whole sequence is
 * skipped and the mark has already landed. That is the only way to reach the
 * gate below without spending the sequence's own two seconds in the suite — and
 * the gate is the part with logic in it.
 */
function withoutMotion(run: () => void): void {
	const real = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		...real.call(window, query),
		matches: query.includes('prefers-reduced-motion')
	})) as typeof window.matchMedia;
	try {
		run();
	} finally {
		window.matchMedia = real;
	}
}

const screen = () => document.querySelector('.boot-screen') as HTMLElement;

const slotWidth = () =>
	(screen().querySelector('.app-wordmark__slot') as HTMLElement).getBoundingClientRect().width;

/**
 * One space in the lockup's own font, measured rather than assumed — it is what
 * the brackets close to, and `ch` follows whichever mono face resolved.
 */
function oneSpace(): number {
	const mark = screen().querySelector('.app-wordmark') as HTMLElement;
	const probe = document.createElement('span');
	probe.style.cssText = 'position:absolute;width:1ch;visibility:hidden';
	mark.append(probe);
	const width = probe.getBoundingClientRect().width;
	probe.remove();
	return width;
}

/** The lockup's own single-period wave, as `AppWordmark.svelte` draws it. */
const WAVE_D_ATTRIBUTE_OF_THE_MARK = 'M2 16Q9 6.7 16 16T30 16';

describe('BootScreen', () => {
	// The reveal is gated on both halves, and this is the half that is easy to
	// lose: a workspace that opened local storage in 40ms must not cut the
	// sequence off in the middle of the pull. It also pins where the sequence
	// starts — on the word, which is what the stretch is a stretch of.
	it('opens on the wordmark and holds the workspace back through the pull', async () => {
		const ondone = vi.fn();
		render(BootScreen, { props: { ready: true, ondone } });

		expect(screen().dataset.stage).toBe('word');
		expect(
			getComputedStyle(screen().querySelector('.app-wordmark')!).getPropertyValue('--wm-open')
		).toBe('1');

		await vi.waitFor(() => expect(screen().dataset.stage).toBe('pull'), { timeout: 2000 });
		expect(ondone).not.toHaveBeenCalled();
	});

	/**
	 * A boot with nothing to wait for, which is the ordinary case and was the one
	 * nothing covered. Two things have to be true of it and both were wrong.
	 *
	 * The mark has to be *closed* before anything fades. `landed` came off a timer
	 * counting from the stage flip while the fall was timed from the browser's next
	 * style resolution, so the two disagreed by a frame — and this easing spends
	 * its last sixth in its final frame, so that frame was the difference between a
	 * shut mark and one still visibly ajar. It fired on the fall's own end now.
	 *
	 * And no waveform draws at all: there is no wait, so there is nothing for one
	 * to report, and a wave flashing up for a tenth of a second on the way out
	 * announces a wait that did not happen.
	 */
	it('closes the mark and draws no waveform when nothing is being waited for', async () => {
		render(BootScreen, { props: { ready: true, ondone: vi.fn() } });
		const wave = () => document.querySelector('.app-wordmark__wave') as SVGSVGElement;
		const path = () => wave().querySelector('path') as SVGPathElement;

		const seen: { open: number; visible: boolean; d: string }[] = [];
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				const el = screen();
				if (!el || !document.contains(el)) return done();
				seen.push({
					open: Number(
						getComputedStyle(el.querySelector('.app-wordmark')!).getPropertyValue('--wm-open')
					),
					visible: getComputedStyle(wave()).visibility === 'visible',
					d: path().getAttribute('d') ?? ''
				});
				if (performance.now() - started < 3000) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// The wave is never drawn, and never redrawn either — the mark keeps its own
		// path from the first frame to the last.
		expect(seen.some((frame) => frame.visible)).toBe(false);
		expect(new Set(seen.map((frame) => frame.d))).toEqual(new Set([WAVE_D_ATTRIBUTE_OF_THE_MARK]));
		// And it shut before it went: fully closed, not caught partway.
		expect(seen.at(-1)!.open).toBeCloseTo(0, 3);
	});

	/**
	 * The workbench arriving *during* the fall, which is the third case and used to
	 * be its own worse ending.
	 *
	 * Whether to close the brackets onto each other was decided once, at the top of
	 * the fall, and expressed by switching between two keyframe sets — so an answer
	 * that came a hundred milliseconds late could not be acted on at all, and the
	 * boot landed on a mark holding an empty gap with no wave in it. Closing is a
	 * transition on a length now, so it can begin whenever the answer does: mid-fall
	 * it starts from wherever the gap had got to and carries on from there.
	 */
	it('closes the brackets even when the workbench arrives mid-fall', async () => {
		const props = $state({ ready: false, ondone: vi.fn() });
		render(BootScreen, { props });
		const wave = () => document.querySelector('.app-wordmark__wave') as SVGSVGElement;

		// Into the fall, then answer.
		await vi.waitFor(() => expect(screen().dataset.stage).toBe('land'), { timeout: 3000 });
		props.ready = true;

		let sawWave = false;
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				const el = screen();
				if (!el || !document.contains(el)) return done();
				if (getComputedStyle(wave()).visibility === 'visible') sawWave = true;
				if (performance.now() - started < 1500) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// No wave: the wait was over before the mark could report one.
		expect(sawWave).toBe(false);
		// And they closed anyway rather than being left holding the mark's gap —
		// down to one space, which is where two bracket characters typed against
		// each other would sit. Zero would butt the strokes into one shape.
		expect(slotWidth()).toBeCloseTo(oneSpace(), 0);
	});

	/**
	 * With nothing to wait for, the fall *is* the exit: the brackets fade as they
	 * travel and are gone before they arrive anywhere.
	 *
	 * Which is why the reveal starts at the top of the fall here rather than at the
	 * landing. Held back to the landing, the mark reached its resting place, sat
	 * there, and was then rubbed out — a still frame in the middle of a movement,
	 * and a beat of bare canvas with nothing on it to uncover.
	 */
	it('fades the brackets out while they are still falling', async () => {
		render(BootScreen, { props: { ready: true, ondone: vi.fn() } });
		const mark = () => screen().querySelector('.app-wordmark') as HTMLElement;

		await vi.waitFor(() => expect(screen().dataset.stage).toBe('land'), { timeout: 3000 });

		const canvasAlpha = (color: string) => {
			const parts = color.match(/[\d.]+/gu) ?? [];
			return parts.length > 3 ? Number(parts[3]) : 1;
		};

		const fall: { open: number; opacity: number; canvas: number; leaving: boolean }[] = [];
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				const el = screen();
				if (!el || !document.contains(el)) return done();
				fall.push({
					open: Number(getComputedStyle(mark()).getPropertyValue('--wm-open')),
					opacity: Number(getComputedStyle(mark()).opacity),
					canvas: canvasAlpha(getComputedStyle(el).backgroundColor),
					leaving: el.hasAttribute('data-leaving')
				});
				if (performance.now() - started < 900) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// The screen starts going while the lockup is still near full stretch.
		const atReveal = fall.find((frame) => frame.leaving)!;
		expect(atReveal.open).toBeGreaterThan(1);

		// And the brackets are completely invisible with travel still left in them —
		// the eye loses a lockup in motion, never one parked at its destination.
		//
		// Asserted as "some frame was like this" rather than "the first zero-opacity
		// frame was": the fall's easing is back-loaded hard, so how much travel is
		// left at any *particular* frame depends on where the frames happen to land.
		// Pinning that made this flake about one run in six, and the flake was worth
		// listening to — the margin was under a frame wide, which is not a margin.
		expect(fall.some((frame) => frame.opacity === 0 && frame.open > 0.05)).toBe(true);

		// It does arrive, a moment later and unseen.
		expect(fall.at(-1)!.open).toBeCloseTo(0, 3);
		expect(fall.at(-1)!.opacity).toBe(0);

		// And the canvas goes with the wordmark rather than ahead of it. It starts
		// leaving at the top of the fall, so without a delay of its own the backdrop
		// cleared while the lockup was still three hundred milliseconds from moving
		// — the workspace arrived first and the brand was left dissolving on top of
		// it. Measured from the frame the fade begins: the canvas is still mostly
		// there.
		const fadeBegins = fall.find((frame) => frame.opacity < 1)!;
		expect(fadeBegins.canvas).toBeGreaterThan(0.4);
	});

	/**
	 * The waiting path's own ending, which is the one the mark survives.
	 *
	 * Three things at once, because they are one sequence and the interesting part
	 * is their order: the wave runs, and when the workbench arrives it does not
	 * stop where it stands — it runs out to a whole wavelength, where it is the
	 * mark's own curve again, and only then does the screen begin to leave. Then
	 * the canvas clears first and the lockup outlasts it.
	 *
	 * That last one is measured rather than read off the durations, because a
	 * duration says nothing about presence: the front-loaded curve the backdrop
	 * uses spends nearly all of its fade in its own first third, so a mark wearing
	 * the same curve collapsed just as fast over twice the duration. It has since
	 * been lost a second way — a `transition` shorthand declared for the fall reset
	 * the one the fade lives on — which is why this is asserted from the pixels.
	 */
	it('runs the wave out to the mark before revealing, and outlasts the backdrop', async () => {
		const props = $state({ ready: false, ondone: vi.fn() });
		render(BootScreen, { props });
		const mark = () => screen().querySelector('.app-wordmark') as HTMLElement;
		const wave = () => document.querySelector('.app-wordmark__wave path') as SVGPathElement;

		await vi.waitFor(() => expect(screen().hasAttribute('data-wait')).toBe(true), {
			timeout: 4000
		});
		expect(wave().getAttribute('d')).not.toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);

		props.ready = true;

		const alpha = (color: string) => {
			const parts = color.match(/[\d.]+/gu) ?? [];
			return parts.length > 3 ? Number(parts[3]) : 1;
		};
		let waveAtReveal = '';
		let markWhenUncovered = Number.NaN;
		const exit: { slot: number; opacity: number }[] = [];
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				const el = screen();
				if (!el || !document.contains(el)) return done();
				if (!waveAtReveal && el.hasAttribute('data-leaving')) {
					waveAtReveal = wave().getAttribute('d') ?? '';
				}
				if (waveAtReveal) {
					exit.push({ slot: slotWidth(), opacity: Number(getComputedStyle(mark()).opacity) });
					if (
						Number.isNaN(markWhenUncovered) &&
						alpha(getComputedStyle(el).backgroundColor) < 0.02
					) {
						markWhenUncovered = Number(getComputedStyle(mark()).opacity);
					}
				}
				if (performance.now() - started < 4000) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// Parked on the mark's own curve before the screen started to go, rather
		// than frozen wherever the workbench happened to arrive.
		expect(waveAtReveal).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);

		// The brackets close to one space, and the mark is gone by the time they get
		// there.
		expect(exit.at(0)!.slot).toBeGreaterThan(oneSpace() * 1.5);
		expect(exit.at(-1)!.slot).toBeCloseTo(oneSpace(), 0);
		expect(exit.at(-1)!.opacity).toBeCloseTo(0, 2);

		// And the fade tracks the travel, which is the whole of it: what is left of
		// the opacity is what is left of the gap. Half closed is half gone.
		//
		// Two easings is what this replaces, and it is invisible in the source and
		// obvious on screen — front-loaded on the gap and back-loaded on the opacity
		// put the brackets halfway shut at 96% opacity, then faded them over travel
		// too small to see. One duration is not one gesture; one curve is.
		// Halfway along the travel, which ends at one space rather than at nothing.
		const midway = (exit.at(0)!.slot + oneSpace()) / 2;
		const halfway = exit.find((frame) => frame.slot < midway)!;
		expect(halfway.opacity).toBeLessThan(0.65);
		expect(halfway.opacity).toBeGreaterThan(0.25);

		// Still there as the canvas goes, though. The lockup is what is being looked
		// at and the canvas is only what is in the way, so they do not go at one
		// rate — the brackets finish their travel over the workspace.
		expect(markWhenUncovered).toBeGreaterThan(0.2);
	});

	/**
	 * The release stops dead at the mark, and this is the assertion that says so.
	 *
	 * It used to carry past rest into a compression and ring back out, and that
	 * cost two rounds of getting the turning point on screen at all — first it was
	 * skipped, then it was held. Both were fixed and the whole thing was then cut,
	 * because a mark that gives and recoils reads as light where this one has to
	 * read as immovable. So the driver is sampled every frame and asserted never
	 * to leave its own range: no overshoot, no rebound, no settling wobble.
	 */
	it('stops dead at the mark rather than springing past it', async () => {
		render(BootScreen, { props: { ready: false, ondone: vi.fn() } });
		const mark = () => screen().querySelector('.app-wordmark') as HTMLElement;
		const driver = () => Number(getComputedStyle(mark()).getPropertyValue('--wm-open'));

		await vi.waitFor(() => expect(screen().dataset.stage).toBe('land'), { timeout: 3000 });

		const samples: number[] = [];
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				samples.push(driver());
				if (performance.now() - started < 700) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// Never past the mark in either direction: the fall is monotonic from the
		// stretch down to rest, and rest is where it stays.
		expect(Math.min(...samples)).toBeGreaterThanOrEqual(-0.001);
		expect(samples.at(-1)).toBeCloseTo(0, 3);
		// And it actually fell — a driver that never moved would satisfy the above.
		expect(Math.max(...samples)).toBeGreaterThan(0.5);
	});

	// And the other half: a landing that arrived first waits, with the mark's own
	// waveform reporting the wait rather than a spinner beside it.
	it('waits on the workspace with the waveform, then reveals', async () => {
		const ondone = vi.fn();
		const props = $state({ ready: false, ondone });
		withoutMotion(() => render(BootScreen, { props }));

		expect(screen().dataset.stage).toBe('land');
		expect(screen().hasAttribute('data-wait')).toBe(true);

		const wave = document.querySelector('.app-wordmark__wave path') as SVGPathElement;

		// The mark's own wave is what is on screen the instant the wait begins.
		expect(wave.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);

		// It is redrawn per frame from here, so sample the geometry rather than a
		// property name: what the animation is made of has changed three times, and
		// what it has to look like has not.
		const frames: { d: string; box: DOMRect }[] = [];
		await new Promise<void>((done) => {
			const started = performance.now();
			const tick = () => {
				frames.push({ d: wave.getAttribute('d') ?? '', box: wave.getBBox() });
				if (performance.now() - started < 700) requestAnimationFrame(tick);
				else done();
			};
			tick();
		});

		// It moves — the phase advances rather than the wave sitting still.
		expect(new Set(frames.map((frame) => frame.d)).size).toBeGreaterThan(10);

		// And the ends never move, which is the whole reason the curve is computed
		// rather than translated. A wave that travels by sliding a longer path has
		// to overrun the box and be clipped, so it widens and loses the round caps
		// the mark ends in — visibly, on the frame the wait starts. Every frame here
		// spans exactly the mark's own `2` to `30`.
		const mark = new DOMParser()
			.parseFromString(
				`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="${WAVE_D_ATTRIBUTE_OF_THE_MARK}"/></svg>`,
				'image/svg+xml'
			)
			.querySelector('path');
		document.body.append(mark!.ownerSVGElement!);
		const markBox = mark!.getBBox();
		mark!.ownerSVGElement!.remove();

		for (const frame of frames) {
			expect(frame.box.x).toBeCloseTo(markBox.x, 5);
			expect(frame.box.width).toBeCloseTo(markBox.width, 5);
		}

		expect(ondone).not.toHaveBeenCalled();

		props.ready = true;
		await vi.waitFor(() => expect(ondone).toHaveBeenCalledTimes(1));
		// The mark gets its own wave back for the frames it has left — and the wave
		// is still drawn for them. It does not wink off when the wait ends; it is
		// taken away by the brackets closing over it, which needs it on screen.
		expect(wave.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
		expect(screen().hasAttribute('data-wait')).toBe(true);
	});
});
