<script lang="ts">
	import type { GuidanceEntry } from '#lib/guidance/guidance.js';
	import { authorityLabels } from '#lib/guidance/guidance.js';
	import { getSource } from '#lib/rules/data/sources.js';
	import CodeProse from './CodeProse.svelte';
	import GuidanceSearchHighlight from './GuidanceSearchHighlight.svelte';
	import SiteSourceFold from './SiteSourceFold.svelte';
	let { entry }: { entry: GuidanceEntry } = $props();
	const sources = $derived(
		entry.sourceIds.flatMap((id) => {
			const source = getSource(id);
			return source ? [source] : [];
		})
	);
</script>

{#snippet marked(value: string)}<GuidanceSearchHighlight text={value} />{/snippet}
<p><CodeProse text={entry.statement} mark={marked} glossary /></p>
{#if entry.example?.correct}
	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Correct</figcaption>
		<pre class="site-sample__text"><GuidanceSearchHighlight text={entry.example.correct} /></pre>
	</figure>
{/if}
{#if entry.example?.incorrect}
	<figure class="site-sample site-sample--invalid">
		<figcaption class="site-sample__label">Incorrect</figcaption>
		<pre class="site-sample__text"><GuidanceSearchHighlight text={entry.example.incorrect} /></pre>
	</figure>
{/if}
<div class="site-meta convention-source">
	<span>{authorityLabels[entry.authority]}</span>
	<span class="site-meta__separator" aria-hidden="true">·</span>
	{#each sources as source (source.id)}<SiteSourceFold sources={[source]} text={marked} />{/each}
</div>
{#if entry.note}
	<p>
		<strong>Exceptions and context:</strong>
		<CodeProse text={entry.note} mark={marked} glossary />
	</p>
{/if}

<style>
	.convention-source {
		margin-block: var(--space-3);
	}
</style>
