<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	// The brand mark, closed, with its own waveform running through it.
	//
	// It scales with the text around it, from a result row to a whole region, and
	// says exactly one thing: a request is out. It is not a substitute for a
	// surface saying what it did.
	//
	// The lockup is parked closed and inert. Everything that moves is the wave, and
	// `wave-loop.ts` owns that; this is only the mounting.
	import AppWordmark from '../layout/AppWordmark.svelte';
	import { runWave } from './wave-loop.js';

	let {
		/**
		 * What the wait is, for anyone who cannot see it. Omit it only when the
		 * containing control already reports its busy state and accessible name.
		 */
		label
	}: { label?: string } = $props();

	let root = $state<HTMLElement>();

	const reducedMotion = prefersReducedMotion();

	$effect(() => {
		const path = root?.querySelector<SVGPathElement>('.app-wordmark__wave path');
		if (!path) return;
		// Slowed rather than stopped: a still wave reads as a drawing, and it is
		// the only thing here reporting that anything is happening at all.
		return runWave(path, { rate: reducedMotion ? 0.35 : 1 });
	});
</script>

<span bind:this={root} class="loading-mark">
	<!-- Parked rather than animated: this owns the wave, and the lockup's own
	     entrance and its hover and press morph would each be a second opinion about
	     where `--wm-open` should be. -->
	<span aria-hidden="true"><AppWordmark animated={false} /></span>
	{#if label}
		<span class="sr-only" role="status">{label}</span>
	{/if}
</span>

<style>
	/*
	 * A wait with no measurable end: the brand mark, closed, with its own waveform
	 * running through it.
	 *
	 * It takes `1em`, so it fits wherever it is used: a quiet button in a chrome row,
	 * a bordered button in a dialog, or a whole loading region whose own font size
	 * makes the mark larger.
	 *
	 * Nothing here is animated by CSS. Everything that moves is the wave, and that is
	 * a curve with a phase in it, which is not something a keyframe can state.
	 * `wave-loop.ts` redraws the path instead.
	 */
	.loading-mark {
		display: inline-flex;
		flex: none;
		width: 1em;
		height: 1em;
		align-items: center;
		justify-content: center;
		font-size: 1em;
		line-height: 1;
	}

	/*
	 * The lockup is parked closed and inert.
	 *
	 * The attribute selector is not decoration: the lockup's own scoped
	 * `.app-wordmark[data-state='static']` sets the driver to 1, and a plain
	 * `.loading-mark :global(.app-wordmark)` ties it on specificity, leaving the
	 * winner to whichever stylesheet happens to load last. Matching the attribute
	 * outranks it outright.
	 */
	.loading-mark :global(.app-wordmark[data-state]) {
		--wm-open: 0;

		/* The closed mark is wider than it is tall. Scaling its own font size lets it
		   fit the same square slot as any other one-em loading glyph. */
		font-size: 0.64em;
		cursor: default;
		pointer-events: none;
		transition: none;
	}
</style>
