<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	// The brand mark, closed, with its own waveform running through it.
	//
	// It scales with the text around it, from a result row to a whole region, and
	// says exactly one thing: a request is out. It is not a substitute for a
	// surface saying what it did.
	//
	// The lockup is parked closed and inert. Everything that moves is the wave, and
	// `wave-loop.ts` owns that — this is only the mounting.
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
