<script lang="ts">
	// The workbench cannot draw until IndexedDB has opened and the startup draft
	// has been recovered, and what used to fill that gap was the sentence
	// "Loading your workspace…" on an otherwise empty canvas.
	//
	// The brand lockup is already a rig with one driver, so it can play the wait
	// rather than describe it. It opens on the wordmark, which is the most brand
	// for the least movement and the thing worth reading; that word is then pulled
	// taut past where it belongs, and released — it collapses under its own weight
	// and stops dead at the mark. The impact is what starts the waveform, and the
	// workspace is revealed from the same instant.
	//
	// The stretch is `--wm-open` driven past its own 0-to-1 range, which is the
	// rig's arithmetic rather than a scale laid on top of it: the brackets travel
	// further, the lead opens wider than the word it uncovers, and `Lint` fans
	// apart on its own spacing. A spring under tension, rather than a picture of
	// one being resized.
	//
	// The other end used to be driven past rest too — a compression the mark rang
	// back out of. It is gone: a mark that gives and recoils reads as light, and
	// the landing is the one moment here that has to read as heavy.
	//
	// The timeline lives here and the shapes live in `shell.css`, next to the
	// arithmetic they override — the same split every other animated thing in this
	// application uses. The durations are published as custom properties rather
	// than written down twice, because a CSS transition that disagrees with the
	// timer driving it tears the sequence in half.
	import AppWordmark from './AppWordmark.svelte';
	import { runWave } from '../primitives/wave-loop.js';
	import { onMount, untrack } from 'svelte';

	let {
		/** Whether the workbench behind this screen is ready to be revealed. */
		ready = false,
		/** Called once the reveal has finished and this screen can be unmounted. */
		ondone
	}: { ready?: boolean; ondone: () => void } = $props();

	/**
	 * The word, before anything moves. Long enough to read a nine-letter compound
	 * and not a moment longer, plus the beat it takes to land on it — motion that
	 * begins on the frame the page paints reads as the page still assembling
	 * itself rather than as the brand doing something on purpose.
	 */
	const READ_MS = 620;
	/** The pull, decelerating into full tension so the stretch reads as held. */
	const PULL_MS = 380;
	/**
	 * The release: the fall from full stretch to the mark, accelerating the whole
	 * way and stopping there. `shell.css` shapes it.
	 *
	 * Its end is the impact, and three things happen on that one instant — the
	 * mark arrives, the waveform starts, and the screen begins to leave. They are
	 * one moment because a landing that sets off everything at once is what makes
	 * it read as a landing.
	 */
	const RELEASE_MS = 420;
	/** Slack for the fallback timer, so it never beats the fall's own end. */
	const LANDING_GRACE_MS = 250;
	/** The backdrop clearing, after a wait, once the mark has landed. */
	const REVEAL_MS = 240;
	/**
	 * And the backdrop on the other path, where the exit runs inside the fall.
	 *
	 * It cannot simply start when the screen starts leaving, because that is the
	 * top of the fall — the canvas was clearing while the lockup was still at full
	 * strength three hundred milliseconds from going anywhere, so the workspace
	 * arrived first and the brand was left dissolving on top of it. The canvas goes
	 * *with* the wordmark: it waits for the same part of the fall the fade is tuned
	 * to, then clears fast enough to be done as the brackets settle.
	 *
	 * The delay is a fraction of the fall rather than a driver threshold like the
	 * fade's, and that is a deliberate difference of kind. The fade needed to be
	 * exact — its whole window is 75ms and being a frame out ruins it. This only
	 * has to arrive in the neighbourhood, and a rough moment stated as a rough
	 * moment is easier to read than arithmetic pretending to more than it has.
	 */
	const FALL_REVEAL_AT_MS = Math.round(RELEASE_MS * 0.75);
	const FALL_REVEAL_MS = 110;
	/**
	 * The exit, after a wait: the brackets come together and go as they do.
	 *
	 * A boot that waited has been holding an open mark with a wave running in it,
	 * so the two things it has to do on the way out are close and disappear — and
	 * they are one gesture, not a sequence. Closing first and fading after leaves a
	 * shut mark sitting on the workspace for a beat, which is the pause this
	 * duration exists to avoid; the fade runs the whole way alongside the closing
	 * so the brackets are gone by the time they meet.
	 */
	const CLOSE_MS = 260;
	/**
	 * And how long the screen stays mounted when the exit runs *inside* the fall.
	 *
	 * It is not a fade duration: on that path the fade is read off the gap between
	 * the brackets rather than off a clock (see `shell.css`), so nothing here times
	 * it. This only has to outlast the fall, or the screen would be pulled out from
	 * under a lockup still visibly falling.
	 */
	const FALL_EXIT_MS = RELEASE_MS + 60;

	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// `word` is where the sequence starts and where the prerendered HTML already
	// is, so the first thing on screen is the product's name rather than a blank
	// canvas — and the stretch has something to be a stretch of.
	let stage = $state<'word' | 'pull' | 'land'>('word');
	// One mark on the release, because everything the impact sets off happens on
	// the same instant. There were two while the spring rang past the mark and
	// back: the reveal began on the turn and the waveform had to wait for the
	// ringing to stop, or it would have been redrawing the same path the recoil
	// was still scaling. With nothing after the landing, both are just `landed`.
	let landed = $state(false);
	let leaving = $state(false);
	// Whether this boot ever had a wait, latched as the fall begins. It says one
	// thing only: the brand never had to become the mark, so the brackets keep the
	// colour they were opened in the whole way down. Where the answer arrives late
	// they will already have tinted partway, and there is nothing to freeze — the
	// hold is honest exactly when it is decided before the fall starts, which is
	// why this one stays latched while `closing` below does not.
	let shut = $state(false);

	// The waveform is the wait, and it is the one place in this application allowed
	// to answer "a request is out" without a spinner, because the mark it lives
	// inside is already on screen. A boot with nothing to wait for never draws one:
	// a wave that appeared for a tenth of a second on its way out would be
	// reporting a wait that did not happen.
	//
	// Once drawn it stays drawn, which is why this latches rather than tracking
	// whether a wait is still on. What the wave does when the workbench arrives is
	// get squeezed out from both ends by the closing brackets — so it has to
	// outlive the wait it was reporting, or it would wink off a beat before the
	// thing that is supposed to be taking it away.
	let sparked = $state(false);

	/**
	 * When the screen starts to leave, which is two different moments and not one.
	 *
	 * **With a wave**, it is the landing. The wave used to have to run out to a
	 * whole wavelength first, so that it was never left frozen mid-stride — which
	 * was worth up to a wavelength of held-back workspace until the exit learned to
	 * close the brackets over it. Squeezed out from both edges, the phase it
	 * happened to be at is not on screen long enough to be anywhere.
	 *
	 * **Without one**, it is the top of the fall. There is nothing left to wait for
	 * by then, so the fall *is* the exit: the brackets fade as they travel and are
	 * gone a moment before they would have met. Waiting for the landing here put a
	 * shut mark on screen and then faded it, which is a still frame in the middle
	 * of a movement — and it is the same answer for a boot that was ready before
	 * the fall began and one that became ready halfway down, because this is
	 * re-asked on every change rather than latched.
	 */
	const exiting = $derived(ready && (sparked ? landed : stage === 'land'));

	/**
	 * One exit duration, and it is measured against what it has to keep pace with.
	 * A wave means the gap is still open, so the fade has a closing beside it and
	 * they share `CLOSE_MS`. Without one the fade is racing the fall, and has to be
	 * finished before it lands.
	 */
	const exitMs = $derived(sparked ? CLOSE_MS : FALL_EXIT_MS);

	/** The backdrop's own timing, which differs on the two paths for the same reason. */
	const revealMs = $derived(sparked ? REVEAL_MS : FALL_REVEAL_MS);
	const revealAtMs = $derived(sparked ? 0 : FALL_REVEAL_AT_MS);

	onMount(() => {
		if (prefersReducedMotion) {
			// The whole point of the sequence is motion, so there is nothing to
			// shorten: park on the mark and let the waveform carry the wait.
			stage = 'land';
			landed = true;
			return;
		}
		let elapsed = 0;
		const at = (ms: number, run: () => void) => setTimeout(run, (elapsed += ms));
		const timers = [
			at(READ_MS, () => (stage = 'pull')),
			at(PULL_MS, () => {
				shut = untrack(() => ready);
				stage = 'land';
			}),
			// The fall's own end, not a timer's idea of it. A timer counts from the
			// stage flip and the animation from the browser's next style resolution,
			// so the two disagree by a frame or so — and this easing spends its last
			// sixth in its final frame, so that frame is the difference between a
			// closed mark and one still visibly ajar. Fading out of *that* is the
			// premature-looking landing this replaces.
			at(RELEASE_MS + LANDING_GRACE_MS, () => (landed = true))
		];
		const onLanded = (event: AnimationEvent) => {
			if (event.animationName.startsWith('boot-release')) landed = true;
		};
		// The timer above is the fallback for a browser that never fires it.
		root?.addEventListener('animationend', onLanded);
		return () => {
			timers.forEach(clearTimeout);
			root?.removeEventListener('animationend', onLanded);
		};
	});

	// The wait redraws the lockup's own wave, and `wave-loop.ts` is what does it —
	// the curve and its loop are not about booting, so they live where anything
	// else that has to draw a wait can reach them. What is boot-specific is only
	// *when* it runs, which is the effect below.
	//
	// The stylesheet already reaches into `.app-wordmark__wave` to drive this
	// screen's version of the mark, and going through the DOM for the path is the
	// same override in the one place CSS cannot express it.
	//
	// It runs at one speed from its first frame. There was a run-in easing it out
	// of rest, which is the right idea for a wave that starts on its own and the
	// wrong one here: this one is struck. The mark lands and the wave is moving,
	// and anything between the two turns an impact into a wind-up. The amplitude
	// held still for the same reason — a wave that swells and shrinks is a second
	// thing to watch in a mark whose only job at that moment is to be steady.
	let root = $state<HTMLElement>();

	$effect(() => {
		// Keyed on the landing alone, and `ready` is read outside the tracked pass on
		// purpose: this has to survive the workbench arriving rather than be torn
		// down by it, because arriving is what starts the run-out below.
		if (!landed) return;
		if (untrack(() => ready)) return;
		const path = root?.querySelector<SVGPathElement>('.app-wordmark__wave path');
		if (!path) return;
		sparked = true;
		// Slowed rather than stopped under reduced motion.
		return runWave(path, { rate: prefersReducedMotion ? 0.35 : 1 });
	});

	// The reveal waits for both: a workspace that arrived early is held behind the
	// landing, and a landing that arrived early waits on the workspace.
	$effect(() => {
		if (!exiting) return;
		leaving = true;
		// The mark is the last thing here to go, so it is what the screen's
		// lifetime is measured against — unmounting on the backdrop's timing would
		// cut the lockup off mid-fade.
		const timer = setTimeout(ondone, prefersReducedMotion ? 0 : exitMs);
		return () => clearTimeout(timer);
	});
</script>

<div
	bind:this={root}
	class="boot-screen"
	data-stage={stage}
	data-wait={sparked ? '' : undefined}
	data-shut={shut ? '' : undefined}
	data-leaving={leaving ? '' : undefined}
	style="--boot-pull: {PULL_MS}ms; --boot-release: {RELEASE_MS}ms; --boot-reveal: {revealMs}ms; --boot-reveal-at: {revealAtMs}ms; --boot-exit: {exitMs}ms; --boot-close: {CLOSE_MS}ms"
>
	<!-- Parked rather than animated: this screen owns the driver, so the lockup's
	     own entrance and its hover and press morph would both be a second opinion
	     about where `--wm-open` should be. -->
	<AppWordmark animated={false} />
	<p class="sr-only" role="status">Loading your workspace…</p>
</div>
