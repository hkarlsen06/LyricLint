<script lang="ts">
	// Restore the spring and radial reveal removed in 456a34c8. Loading proceeds
	// independently; readiness can only release the splash after the pull.
	import AppWordmark from './AppWordmark.svelte';
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { runWave } from '../primitives/wave-loop.js';
	import { bootBlastEvent } from './workbench-navigation.js';
	import { untrack } from 'svelte';
	let {
		ready = false,
		start = true,
		ondone = () => {}
	}: { ready?: boolean; start?: boolean; ondone?: () => void } = $props();
	const PULL_MS = 380;
	const RELEASE_MS = 420;
	const LANDING_GRACE_MS = 250;
	const BLAST_MS = 420;
	const BLAST_AT_MS = Math.round(RELEASE_MS * 0.75);
	const CLOSE_MS = 260;
	const FALL_EXIT_MS = RELEASE_MS + 60;
	const reducedMotion = prefersReducedMotion();
	// The pull animates a registered property on the main thread, so it drops
	// frames under the root view transition that brings this cover in. The
	// wordmark holds open until the splash reports that crossfade finished.
	// svelte-ignore state_referenced_locally
	let stage = $state<'hold' | 'pull' | 'land'>(start ? 'pull' : 'hold');
	let landed = $state(false);
	let shut = $state(false);
	let sparked = $state(false);
	let blasting = $state(false);
	const exiting = $derived(ready && (sparked ? landed : stage === 'land'));
	const exitMs = $derived(sparked ? CLOSE_MS : FALL_EXIT_MS);
	const blastAtMs = $derived(sparked ? 0 : BLAST_AT_MS);
	const doneMs = $derived(Math.max(exitMs, blastAtMs + BLAST_MS));
	$effect(() => {
		if (reducedMotion) {
			stage = 'land';
			landed = true;
			return;
		}
		if (stage === 'hold') {
			if (start) stage = 'pull';
			return;
		}
		const pulling = stage === 'pull';
		const advance = () => {
			if (pulling) {
				shut = untrack(() => ready);
				stage = 'land';
			} else landed = true;
		};
		const onStageEnd = (event: AnimationEvent) => {
			if (event.animationName.endsWith(pulling ? 'boot-pull' : 'boot-release')) advance();
		};
		root?.addEventListener('animationend', onStageEnd);
		const timer = setTimeout(advance, (pulling ? PULL_MS : RELEASE_MS) + LANDING_GRACE_MS);
		return () => {
			clearTimeout(timer);
			root?.removeEventListener('animationend', onStageEnd);
		};
	});
	let root = $state<HTMLElement>();
	$effect(() => {
		if (!landed || ready || reducedMotion) return;
		const path = root?.querySelector<SVGPathElement>('.app-wordmark__wave path');
		if (!path) return;
		sparked = true;
		return runWave(path);
	});
	$effect(() => {
		if (!exiting) return;
		let completed = false;
		const complete = () => {
			if (completed) return;
			completed = true;
			ondone();
		};
		const onBlastStart = (event: AnimationEvent) => {
			if (!event.animationName.endsWith('boot-shockwave')) return;
			// The workspace entrance waits for this: a reveal under the cover is unseen.
			blasting = true;
			window.dispatchEvent(new Event(bootBlastEvent));
		};
		const onBlastEnd = (event: AnimationEvent) => {
			if (event.animationName.endsWith('boot-shockwave')) complete();
		};
		root?.addEventListener('animationstart', onBlastStart);
		root?.addEventListener('animationend', onBlastEnd);
		// Prefer the actual last frame. The timer only covers missing animationend.
		const timer = setTimeout(complete, reducedMotion ? 0 : doneMs + LANDING_GRACE_MS);
		return () => {
			clearTimeout(timer);
			root?.removeEventListener('animationstart', onBlastStart);
			root?.removeEventListener('animationend', onBlastEnd);
		};
	});
</script>

<div
	bind:this={root}
	class="navigation-splash boot-screen"
	aria-hidden="true"
	data-stage={stage}
	data-wait={sparked || reducedMotion ? '' : undefined}
	data-shut={shut ? '' : undefined}
	data-leaving={exiting ? '' : undefined}
	data-blasting={blasting ? '' : undefined}
	style="--boot-pull: {PULL_MS}ms; --boot-release: {RELEASE_MS}ms; --boot-blast: {BLAST_MS}ms; --boot-blast-at: {blastAtMs}ms; --boot-exit: {exitMs}ms; --boot-close: {CLOSE_MS}ms"
>
	<AppWordmark animated={false} />
</div>

<style>
	.boot-screen {
		--boot-stretch: 1.22;
		--boot-fade-gone: 0.28;
		--boot-fade-span: 0.5;
		--boot-shock-reach: 101%;
		--boot-front: calc(var(--boot-shock) * var(--boot-shock-reach));
		position: fixed;
		inset: 0;
		z-index: var(--layer-boot);
		display: grid;
		font-size: var(--font-size-3xl);
		place-content: center;
		pointer-events: none;
	}
	.boot-screen::before {
		position: absolute;
		background: var(--color-canvas);
		content: '';
		inset: 0;
		-webkit-mask-image: radial-gradient(
			circle at center,
			transparent var(--boot-front),
			#000 calc(var(--boot-front) + 1px)
		);
		mask-image: radial-gradient(
			circle at center,
			transparent var(--boot-front),
			#000 calc(var(--boot-front) + 1px)
		);
	}
	.boot-screen :global(.app-wordmark) {
		--wm-open: 1;
		position: relative;
		font-size: inherit;
		cursor: default;
		pointer-events: none;
		transition: --wm-slot-closed var(--boot-close) linear;
	}
	.boot-screen[data-shut] :global(.app-wordmark__bracket) {
		stroke: var(--color-warning);
	}
	.boot-screen[data-stage='pull'] :global(.app-wordmark) {
		--wm-open: var(--boot-stretch);
		animation: boot-pull var(--boot-pull) var(--ease-out-quart);
	}
	@keyframes boot-pull {
		from {
			--wm-open: 1;
		}
		to {
			--wm-open: var(--boot-stretch);
		}
	}
	.boot-screen[data-stage='land'] :global(.app-wordmark) {
		--wm-open: 0;
		animation: boot-release var(--boot-release) cubic-bezier(0.5, 0, 0.85, 0.25);
	}
	@keyframes boot-release {
		from {
			--wm-open: var(--boot-stretch);
		}
		to {
			--wm-open: 0;
		}
	}
	.boot-screen :global(.app-wordmark__wave) {
		visibility: hidden;
		transition: --boot-wave-edge var(--boot-exit) linear;
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--boot-wave-edge),
			#000 calc(100% - var(--boot-wave-edge)),
			transparent
		);
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--boot-wave-edge),
			#000 calc(100% - var(--boot-wave-edge)),
			transparent
		);
	}
	.boot-screen[data-wait] :global(.app-wordmark__wave) {
		visibility: visible;
	}
	@property --boot-wave-edge {
		syntax: '<percentage>';
		inherits: false;
		initial-value: 0%;
	}
	.boot-screen[data-leaving] :global(.app-wordmark__wave) {
		--boot-wave-edge: 50%;
	}
	.boot-screen[data-leaving] {
		animation: boot-shockwave var(--boot-blast) cubic-bezier(0.2, 0.7, 0.4, 1) var(--boot-blast-at)
			both;
		pointer-events: none;
	}
	.boot-screen[data-leaving] :global(.app-wordmark) {
		--wm-slot-closed: 1ch;
	}
	.boot-screen[data-wait][data-leaving] :global(.app-wordmark) {
		opacity: 0;
		transition:
			opacity var(--boot-exit) linear,
			--wm-slot-closed var(--boot-exit) linear;
	}
	.boot-screen[data-leaving]:not([data-wait]) :global(.app-wordmark) {
		opacity: clamp(0, calc((var(--wm-open) - var(--boot-fade-gone)) / var(--boot-fade-span)), 1);
	}
	@property --boot-shock {
		syntax: '<number>';
		inherits: true;
		initial-value: 0;
	}
	@keyframes boot-shockwave {
		from {
			--boot-shock: 0;
		}
		to {
			--boot-shock: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.boot-screen[data-stage] :global(.app-wordmark) {
			animation: none;
			transition: none;
		}
		.boot-screen[data-leaving] {
			animation: none;
		}
	}
</style>
