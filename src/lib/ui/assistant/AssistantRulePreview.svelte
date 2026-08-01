<script lang="ts">
	/**
	 * A cited rule: its title as the way to the full reference, and one meta
	 * line of facts — severity, fix behavior, the reviewed source it stands on.
	 * The raw rule id and the corpus explanation are deliberately absent: both
	 * are the linter's voice, written for the rule reference, and in a chat
	 * answer they repeated internals the prose had already covered. Everything
	 * here is resolved from the local corpus, never from model output, and the
	 * complete reference opens on the rule's own page in a new tab.
	 */
	import { resolve } from '$app/paths';
	import type { Severity } from '$lib/core/types.js';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import { safeExternalUrl } from '$lib/diagnostics/source-url.js';
	import type { RulePreview } from '$lib/assistant/rule-previews.js';

	let { rule, number }: { rule: RulePreview; number: number } = $props();

	const fixDescription = $derived(
		rule.fix === 'safe'
			? 'Fixed automatically'
			: rule.fix === 'preview'
				? 'Previewed fix'
				: 'No automatic fix'
	);
</script>

<section class="assistant-rule" aria-label={`Rule reference: ${rule.title}`}>
	<span class="assistant-citation-number">{number}</span>
	<h4 class="assistant-rule__title">
		<a
			href={resolve('/(site)/rules/[rule]', { rule: rule.slug })}
			target="_blank"
			rel="noopener noreferrer"
		>
			{rule.title}
			<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
				<path
					d="M4 2h6v6M10 2L3 9"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
	</h4>
	<p class="assistant-rule__meta">
		<SeverityTag severity={rule.severity as Severity} />
		<span class="assistant-rule__separator" aria-hidden="true">·</span>
		<span>{fixDescription}{rule.fixLabel ? ` · ${rule.fixLabel}` : ''}</span>
		{#each rule.sources as source (source.id)}
			{@const url = safeExternalUrl(source.url)}
			{@const tooltip = `${source.sectionTitle} · verified ${source.lastVerifiedAt}`}
			<span class="assistant-rule__separator" aria-hidden="true">·</span>
			{#if url}
				<!-- The URL went through safeExternalUrl, the one gate every citation
				     link takes. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="assistant-rule__source"
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					title={tooltip}
				>
					{source.pageTitle}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<span class="assistant-rule__source">{source.pageTitle}</span>
			{/if}
		{/each}
	</p>
</section>
