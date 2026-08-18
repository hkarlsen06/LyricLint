<script lang="ts">
	/*
	 * An entry's standing drawn as the ladder it sits on: four steps for the
	 * four source tiers, ascending, filled up to the tier the entry's sources
	 * establish. It is `aria-hidden` — the tier label beside it is the fact,
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
