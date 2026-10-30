<script lang="ts">
	import GuideQuestions from './GuideQuestions.svelte';
	import { authorityLabels, type GuidanceAuthority } from '#lib/guidance/guidance.js';
	import AuthorityLadder from '#lib/ui/site/AuthorityLadder.svelte';

	const tiers: readonly { authority: GuidanceAuthority; description: string }[] = [
		{
			authority: 'lyriclint',
			description:
				"LyricLint's own preference, on a convention no Genius source states: the blank line between song parts, the text-hygiene checks. It shares the bottom step with community guidance, because our preference claims no more standing than unreviewed community writing."
		},
		{
			authority: 'community',
			description:
				'Ordinary community voice in any venue: an unreviewed annotation, guide-page text with no staff badge, an ordinary forum post.'
		},
		{
			authority: 'external',
			description:
				"An authority outside Genius: a dictionary, a language academy, a platform's own documentation. It ranks below a reviewed annotation because it is authoritative about language, not about Genius."
		},
		{
			authority: 'editorial',
			description: 'A reviewed Genius annotation with no staff among its contributors.'
		},
		{
			authority: 'staff',
			description:
				"Genius staff wrote or touched it: a staff-badged guide page, staff among an annotation's contributors, or a staff reply on the forum. Who wrote it decides the tier, never the venue it appears in."
		}
	];
</script>

<section class="site-prose site-split__page guide-welcome" aria-label="Getting started">
	<div class="guide-welcome__questions"><GuideQuestions examples /></div>
	<details class="reference-disclosure">
		<summary>Where does the advice come from?</summary>
		<p>
			Each entry names its source and authority tier. A linked linter check may cover only part of a
			convention; read its example and the entry’s qualifications for the limits.
		</p>
		<dl class="guidelines__tiers">
			{#each tiers as { authority, description } (authority)}
				<div>
					<dt>
						<AuthorityLadder {authority} />
						{authorityLabels[authority]}
					</dt>
					<dd>{description}</dd>
				</div>
			{/each}
		</dl>
	</details>

	<details id="harper" class="reference-disclosure">
		<summary>What about spelling and grammar?</summary>
		<p>
			The workbench also uses Harper for English spelling, grammar, and style suggestions. Those
			suggestions come from the proofreader, so they are not listed here as Genius conventions. Read
			them in the context of the lyrics before applying a change.
		</p>
	</details>
</section>

<style>
	@media (max-width: 62rem) {
		.guide-welcome__questions {
			display: none;
		}
	}
	.reference-disclosure {
		margin-block: var(--space-5);
	}
	.reference-disclosure > summary {
		cursor: pointer;
		font-weight: var(--font-weight-medium);
	}
	.reference-disclosure > summary:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
	.reference-disclosure[open] > summary {
		margin-block-end: var(--space-3);
	}
	.guidelines__tiers {
		margin: 0;
	}
	.guidelines__tiers div + div {
		margin-block-start: var(--space-4);
	}
	.guidelines__tiers dt {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		font-weight: var(--font-weight-semibold);
	}
	.guidelines__tiers dd {
		margin: var(--space-1) 0 0;
	}
</style>
