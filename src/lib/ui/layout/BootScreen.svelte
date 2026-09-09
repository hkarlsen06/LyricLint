<script lang="ts">
	// This screen reports pending startup only. The parent removes it as soon as
	// the real editor is ready, even if the wordmark has not finished moving.
	import AppWordmark from './AppWordmark.svelte';
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { runWave } from '../primitives/wave-loop.js';
	import { onMount } from 'svelte';

	const READ_MS = 620;
	const PULL_MS = 380;
	const RELEASE_MS = 420;
	const LANDING_GRACE_MS = 250;
	const reducedMotion = prefersReducedMotion();

	let stage = $state<'word' | 'pull' | 'land'>('word');
	let landed = $state(false);
	let root = $state<HTMLElement>();
	let waitMessage = $state('');

	onMount(() => {
		// Insert the message after the empty live region mounts so it is announced.
		const announceWait = setTimeout(() => (waitMessage = 'Loading your workspace…'));
		return () => clearTimeout(announceWait);
	});

	onMount(() => {
		if (reducedMotion) {
			stage = 'land';
			landed = true;
			return;
		}
		let elapsed = 0;
		const at = (ms: number, run: () => void) => setTimeout(run, (elapsed += ms));
		const timers = [
			at(READ_MS, () => (stage = 'pull')),
			at(PULL_MS, () => (stage = 'land')),
			// Prefer the animation's actual end; a timer is only a fallback for a
			// browser that does not dispatch animationend.
			at(RELEASE_MS + LANDING_GRACE_MS, () => (landed = true))
		];
		const onLanded = (event: AnimationEvent) => {
			if (event.animationName.startsWith('boot-release')) landed = true;
		};
		root?.addEventListener('animationend', onLanded);
		return () => {
			timers.forEach(clearTimeout);
			root?.removeEventListener('animationend', onLanded);
		};
	});

	$effect(() => {
		if (!landed) return;
		const path = root?.querySelector<SVGPathElement>('.app-wordmark__wave path');
		if (!path) return;
		// The existing wait waveform slows under reduced motion. Its teardown
		// cancels the frame loop immediately when the parent removes this screen.
		return runWave(path, { rate: reducedMotion ? 0.35 : 1 });
	});
</script>

<div
	bind:this={root}
	class="boot-screen"
	data-stage={stage}
	data-wait={landed ? '' : undefined}
	style="--boot-pull: {PULL_MS}ms; --boot-release: {RELEASE_MS}ms"
>
	<AppWordmark animated={false} />
	<p class="sr-only" role="status">{waitMessage}</p>
</div>
