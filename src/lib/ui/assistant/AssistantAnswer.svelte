<script lang="ts">
	/**
	 * One assistant answer, structured for reading: the typed blocks flow
	 * uninterrupted (a card after every paragraph chopped the answer into
	 * fragments), and every citation is collected once at the foot, deduplicated,
	 * under one label. Each passage carries superscript citation numbers, and
	 * the foot's cards answer to them, so the tie between a claim and its rule
	 * survives the citations moving out of the prose. A rule id the local
	 * corpus cannot resolve renders nothing: canonical facts come from the
	 * corpus or not at all.
	 */
	import type { StructuredAssistantAnswer } from '$lib/assistant/types.js';
	import { safeExternalUrl } from '$lib/diagnostics/source-url.js';
	import type { RulePreview, RulePreviewSource } from '$lib/assistant/rule-previews.js';
	import AssistantRulePreview from './AssistantRulePreview.svelte';

	let {
		answer,
		previews,
		sources,
		referencesFailedToLoad = false
	}: {
		answer: StructuredAssistantAnswer;
		previews: Map<string, RulePreview> | undefined;
		sources: Map<string, RulePreviewSource> | undefined;
		referencesFailedToLoad?: boolean;
	} = $props();

	// Every rule the answer cites, once, in order of first citation.
	const citedRules = $derived(
		[...new Set(answer.blocks.flatMap((block) => block.ruleIds))].flatMap((ruleId) => {
			const rule = previews?.get(ruleId);
			return rule ? [rule] : [];
		})
	);
	// A source already on a cited rule's card is not cited a second time.
	const citedRuleSourceIds = $derived(
		new Set(citedRules.flatMap((rule) => rule.sources.map((source) => source.id)))
	);
	const directSources = $derived(
		[...new Set(answer.blocks.flatMap((block) => block.sourceIds))].flatMap((sourceId) => {
			const source = sources?.get(sourceId);
			return source && !citedRuleSourceIds.has(sourceId) ? [source] : [];
		})
	);
	// One numbering over everything the foot lists: the rule cards first, then
	// the direct sources, so a number in the prose is a position in the foot.
	// Rule ids and source ids live in different namespaces, so one map holds both.
	const citationNumbers = $derived(
		new Map<string, number>([
			...citedRules.map((rule, index) => [rule.id, index + 1] as const),
			...directSources.map((source, index) => [source.id, citedRules.length + index + 1] as const)
		])
	);
	const citesAnything = $derived(
		answer.blocks.some((block) => block.ruleIds.length > 0 || block.sourceIds.length > 0)
	);

	/** The numbers a block cites, deduplicated and in reading order. An id the
	 * numbering does not know (an unresolved rule, a source already covered by
	 * a card) simply contributes no mark. */
	function blockRefs(block: StructuredAssistantAnswer['blocks'][number]): number[] {
		const numbers = [...block.ruleIds, ...block.sourceIds].flatMap((id) => {
			const number = citationNumbers.get(id);
			return number === undefined ? [] : [number];
		});
		return [...new Set(numbers)].sort((a, b) => a - b);
	}
</script>

{#if answer.scope === 'not-covered'}
	<p class="assistant-scope">The reviewed guidelines do not settle this one.</p>
{/if}
{#each answer.blocks as block, index (index)}
	{@const refs = blockRefs(block)}
	{#if block.kind === 'general'}
		<span class="assistant-general">General language guidance</span>
	{/if}
	{#if block.kind === 'example'}
		<!-- An example cites rules too, and its marks must not go inside the
		     `pre`; they ride the block's own corner instead. Dropping them was
		     how a cited rule's number went missing from a real answer. -->
		<div class="assistant-example">
			<pre class="assistant-block assistant-block--example" dir="auto"><code>{block.text}</code
				></pre>
			{#if refs.length > 0}
				<sup class="assistant-block__refs assistant-block__refs--example"
					>{#each refs as number (number)}<span class="assistant-citation-number">{number}</span
						>{/each}</sup
				>
			{/if}
		</div>
	{:else}
		<p class="assistant-block">
			{block.text}{#if refs.length > 0}<sup class="assistant-block__refs"
					>{#each refs as number (number)}<span class="assistant-citation-number">{number}</span
						>{/each}</sup
				>{/if}
		</p>
	{/if}
{/each}
{#if citedRules.length > 0 || directSources.length > 0}
	<div class="assistant-citations">
		<span class="assistant-citations__label">Cited rules</span>
		{#if citedRules.length > 0}
			<div class="assistant-rule-run">
				{#each citedRules as rule, index (rule.id)}
					<AssistantRulePreview {rule} number={index + 1} />
				{/each}
			</div>
		{/if}
		{#if directSources.length > 0}
			<ul class="assistant-block__sources" aria-label="Reviewed sources">
				{#each directSources as source (source.id)}
					{@const url = safeExternalUrl(source.url)}
					<li>
						<span class="assistant-citation-number">{citationNumbers.get(source.id)}</span>
						{#if url}
							<!-- The tab is what a citation always opens here. The answer is
							     the thing being read, and a source is a lookup beside it, so
							     the note joins the link's name, as it does on every other
							     external link in the application. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- safeExternalUrl has validated this external citation. -->
							<a href={url} target="_blank" rel="noopener noreferrer"
								>{source.pageTitle}<span class="sr-only">(opens in a new tab)</span></a
							>
						{:else}
							{source.pageTitle}
						{/if}
						· {source.sectionTitle} · verified {source.lastVerifiedAt}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
{#if referencesFailedToLoad && citesAnything}
	<p class="assistant-reference-error" role="status">
		The canonical references could not be loaded. Reload to show this answer’s citations.
	</p>
{/if}

<style>
	.assistant-block {
		margin: 0 0 var(--space-3);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.assistant-block--example {
		overflow-x: auto;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-fill-subtle);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
	}

	.assistant-block__sources {
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.assistant-block__sources .assistant-citation-number {
		margin-inline-end: var(--space-0-5);
	}

	.assistant-block__sources a {
		color: inherit;
	}

	.assistant-block__sources a:hover {
		color: var(--color-text);
	}

	.assistant-general {
		display: inline-block;
		margin-block-end: var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.assistant-scope {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.assistant-reference-error {
		margin: calc(-1 * var(--space-2)) 0 var(--space-3);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	/* The answer's citations, collected once at its foot. Cards after every
	 * paragraph chopped the answer into fragments, and the same source was cited
	 * three times down one reply. The references form a quiet run separated
	 * by space, matching the review list, and each is a title over one meta
	 * line: severity, fix behavior, source. */
	.assistant-citations {
		display: grid;
		gap: var(--space-2);
		margin-block: var(--space-4) var(--space-3);
	}

	.assistant-citations__label {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.assistant-rule-run {
		display: grid;
		gap: var(--space-2);
	}

	.assistant-block__refs {
		display: inline-flex;
		gap: var(--space-1);
		margin-inline-start: var(--space-0-5);
		vertical-align: 0.35em;
	}

	/* The example's marks ride the block's own corner: inside the `pre` they
	 * would read as part of the quoted document. */
	.assistant-example {
		position: relative;
	}

	.assistant-block__refs--example {
		position: absolute;
		top: var(--space-2);
		right: var(--space-3);
		margin: 0;
	}
</style>
