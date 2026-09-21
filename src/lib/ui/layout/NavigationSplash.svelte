<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { fade } from 'svelte/transition';
	import AppWordmark from './AppWordmark.svelte';

	let { active }: { active: boolean } = $props();

	function exit(node: HTMLElement) {
		const time = getComputedStyle(node).getPropertyValue('--duration-fast').trim();
		return fade(node, {
			duration: prefersReducedMotion() ? 0 : parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
		});
	}
</script>

{#if active}
	<div class="navigation-splash" out:exit aria-hidden="true">
		<AppWordmark animated={false} />
	</div>
{/if}

<style>
	.navigation-splash {
		position: fixed;
		inset: 0;
		z-index: var(--layer-boot);
		display: grid;
		place-content: center;
		background: var(--color-canvas);
		font-size: var(--font-size-3xl);
		pointer-events: none;
	}

	.navigation-splash :global(.app-wordmark) {
		font-size: inherit;
		pointer-events: none;
		animation: navigation-wordmark var(--duration-brand) var(--ease-in-out-cubic) both;
	}

	@keyframes navigation-wordmark {
		from {
			--wm-open: 1;
		}
		25% {
			--wm-open: 1.12;
		}
		to {
			--wm-open: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.navigation-splash :global(.app-wordmark) {
			animation: none;
		}
	}
</style>
