<script lang="ts">
	/*
	 * An entry's standing drawn as the ladder it sits on: four steps for the
	 * four source tiers, ascending, filled up to the tier the entry's sources
	 * establish. It is `aria-hidden`, because the tier label beside it is the fact,
	 * and the two are drawn together wherever an entry states its standing:
	 * the guidance topic pages, and the landing page's reproduction of them.
	 *
	 * A LyricLint advisory takes the bottom step, level with community
	 * guidance: our own preference claims no more standing than unreviewed
	 * community writing, and a row with no ladder at all read as a different
	 * kind of fact rather than as the lowest rung of the same one.
	 */
	import { authorityRank, type GuidanceAuthority } from '$lib/guidance/guidance.js';

	let { authority }: { authority: GuidanceAuthority } = $props();

	const rank = $derived(authority === 'lyriclint' ? 0 : authorityRank[authority]);
	const steps = $derived(Array.from({ length: 4 }, (_, step) => step <= rank));
</script>

<span class="site-ladder" aria-hidden="true">
	{#each steps as met, step (step)}
		<span class="site-ladder__step" class:site-ladder__step--met={met}></span>
	{/each}
</span>

<style>
	/*
	 * The authority ladder: four ascending steps for
	 * the four source tiers, filled up to the tier the entry's sources establish.
	 * The bars are `aria-hidden` (the tier label beside them is the fact), and
	 * an unmet step keeps an opaque muted colour rather than fading, because
	 * opacity is never a state carrier.
	 */
	.site-ladder {
		display: inline-flex;
		gap: var(--space-0-5);
		align-items: flex-end;
	}

	.site-ladder__step {
		width: 0.3rem;
		background: var(--color-border-strong);
	}

	.site-ladder__step--met {
		background: var(--color-accent);
	}

	.site-ladder__step:nth-child(1) {
		height: 0.3rem;
	}

	.site-ladder__step:nth-child(2) {
		height: 0.45rem;
	}

	.site-ladder__step:nth-child(3) {
		height: 0.6rem;
	}

	.site-ladder__step:nth-child(4) {
		height: 0.75rem;
	}
</style>
