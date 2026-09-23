<script lang="ts">
	/**
	 * A cited rule: its title as the way to the full reference, and one meta
	 * line of facts: severity, fix behavior, the reviewed source it stands on.
	 * The raw rule id and the corpus explanation are deliberately absent: both
	 * are the linter's voice, written for the rule reference, and in a chat
	 * answer they repeated internals the prose had already covered. Everything
	 * here is resolved from the local corpus, never from model output, and the
	 * complete reference opens on the rule's own page in a new tab.
	 */
	import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
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
			href="{resolve('/(site)/guidelines/checks/[rule]', { rule: rule.slug })}/"
			target="_blank"
			rel="noopener noreferrer"
		>
			{rule.title}
			<ArrowSquareOutIcon aria-hidden="true" size={11} weight="bold" />
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
				<!-- eslint-disable svelte/no-navigation-without-resolve -- safeExternalUrl has validated this external citation. -->
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

<style>
	/* The number is a rail beside the card, so the title and the meta line keep
	 * one left edge under each other. */
	.assistant-rule {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: var(--space-2);
		row-gap: var(--space-1);
		padding: var(--space-2-5) var(--space-3);
	}

	.assistant-rule > .assistant-citation-number {
		align-self: center;
		min-width: 1ch;
		font-size: var(--font-size-xs);
		text-align: end;
	}

	.assistant-rule__title,
	.assistant-rule__meta {
		grid-column: 2;
	}

	/* The card was three shades of accent blue per row (title, arrow, source),
	 * and a run of three cards was a wall of it. The title rests in the text
	 * color and earns its underline under the pointer; the muted arrow is the
	 * mark that says the press leaves. */
	.assistant-rule__title {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}

	.assistant-rule__title a {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		color: var(--color-text);
		text-decoration: none;
	}

	.assistant-rule__title a:hover {
		text-decoration: underline;
	}

	.assistant-rule__title :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	/* The source is one fact on the meta line, so it wears the line's own muted
	 * color; the underline is what says it is a link. */
	.assistant-rule__source {
		color: inherit;
	}

	a.assistant-rule__source:hover {
		color: var(--color-text);
	}

	/* `center`, not `baseline`: the severity tag is an inline-flex led by its
	 * glyph, which has no text baseline, so a baseline row seats it high. The
	 * diagnostic meta row makes the same choice for the same reason. */
	.assistant-rule__meta {
		display: flex;
		margin: 0;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.assistant-rule__separator {
		color: var(--color-text-muted);
	}
</style>
