<script lang="ts">
	/**
	 * One assistant answer: its typed blocks in order, each cited rule's full
	 * reference immediately after the block it supports. A rule id the local
	 * corpus cannot resolve renders nothing — canonical facts come from the
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
</script>

{#if answer.scope === 'not-covered'}
	<p class="assistant-scope">The reviewed guidelines do not settle this one.</p>
{/if}
{#each answer.blocks as block, index (index)}
	{#if block.kind === 'general'}
		<span class="assistant-general">General language guidance</span>
	{/if}
	{#if block.kind === 'example'}
		<pre class="assistant-block assistant-block--example" dir="auto"><code>{block.text}</code></pre>
	{:else}
		<p class="assistant-block">{block.text}</p>
	{/if}
	{@const ruleSourceIds = new Set(
		block.ruleIds.flatMap(
			(ruleId) => previews?.get(ruleId)?.sources.map((source) => source.id) ?? []
		)
	)}
	{@const directSources = block.sourceIds.flatMap((sourceId) => {
		const source = sources?.get(sourceId);
		return source && !ruleSourceIds.has(sourceId) ? [source] : [];
	})}
	{#if directSources.length > 0}
		<ul class="assistant-block__sources" aria-label="Reviewed sources">
			{#each directSources as source (source.id)}
				{@const url = safeExternalUrl(source.url)}
				<li>
					{#if url}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={url} target="_blank" rel="noopener noreferrer">{source.pageTitle}</a>
					{:else}
						{source.pageTitle}
					{/if}
					· {source.sectionTitle} · verified {source.lastVerifiedAt}
				</li>
			{/each}
		</ul>
	{/if}
	{#each block.ruleIds as ruleId (ruleId)}
		{@const rule = previews?.get(ruleId)}
		{#if rule}
			<AssistantRulePreview {rule} />
		{/if}
	{/each}
	{#if referencesFailedToLoad && (block.ruleIds.length > 0 || block.sourceIds.length > 0)}
		<p class="assistant-reference-error" role="status">
			The canonical references could not be loaded. Reload to show this answer’s attachments.
		</p>
	{/if}
{/each}
