<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { tick, untrack } from 'svelte';
	import BootScreen from './BootScreen.svelte';

	let { active }: { active: boolean } = $props();
	let requested = $state(false);
	let visible = $state(false);
	// True once no entry view transition is running, so the cover's spring can
	// start on a frame budget of its own instead of under the root crossfade.
	let settled = $state(true);
	let transition: ViewTransition | undefined;
	let interrupted = false;

	export async function waitUntilCovered(): Promise<void> {
		await tick();
		await transition?.updateCallbackDone.catch(() => {});
	}

	function interrupt() {
		if (!active && !visible && !requested) return;
		interrupted = true;
		requested = false;
		transition?.skipTransition();
	}

	$effect(() => {
		if (active) requested = true;
	});

	$effect(() => {
		const show = requested;
		if (show === untrack(() => visible)) return;
		const skip = interrupted || prefersReducedMotion() || document.hidden;
		interrupted = false;
		if (skip || !document.startViewTransition) {
			visible = show;
			settled = true;
			return;
		}

		// Loading runs independently. Each capture only waits for this DOM update.
		// Skipped transitions still call update, so read the latest requested state.
		const update = async () => {
			visible = requested;
			await tick();
		};
		document.documentElement.setAttribute('data-navigation-transition', '');
		settled = false;
		try {
			const current = (transition = document.startViewTransition(update));
			void current.ready.catch(() => {});
			void current.finished
				.finally(() => {
					if (transition !== current) return;
					transition = undefined;
					settled = true;
					document.documentElement.removeAttribute('data-navigation-transition');
				})
				.catch(() => {});
			return () => current.skipTransition();
		} catch {
			document.documentElement.removeAttribute('data-navigation-transition');
			visible = show;
			settled = true;
		}
	});
</script>

<svelte:window onpointerdown={interrupt} onkeydown={interrupt} />

{#if visible}
	<BootScreen ready={!active} start={settled} ondone={() => (requested = false)} />
{/if}

<style>
	:global(html[data-navigation-transition]::view-transition-group(root)) {
		animation-duration: var(--duration-fast);
		animation-timing-function: var(--ease-out-quart);
	}

	:global(html[data-navigation-transition]::view-transition) {
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html[data-navigation-transition]::view-transition-group(root)) {
			animation-duration: 0s;
		}
	}
</style>
