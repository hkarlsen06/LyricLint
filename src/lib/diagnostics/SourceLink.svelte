<script lang="ts">
	import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
	import type { Snippet } from 'svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import { sourceFavicon } from './source-favicons.js';
	import { safeExternalUrl } from './source-url.js';

	/**
	 * How the two strings on this block are drawn, for a surface that has
	 * something to say about them.
	 *
	 * The rule reference searches its citations along with everything else on the
	 * page, so the page a search opens has to be able to mark the words that
	 * matched, and a citation reading `Song Headers in Different Languages`
	 * against a query of `languages` with nothing marked on it is the failure that
	 * widening the search was supposed to remove, arriving from the other side.
	 *
	 * A snippet rather than this component reaching for the marker itself, because
	 * `src/lib/diagnostics/` sits outside `src/lib/ui/` on purpose: the editor may
	 * not depend on the shell, and the linter's popover draws this same block. So
	 * the surface that knows about a query passes one in, and the two that do not
	 * (the popover and the tools panel) get the text.
	 */
	let { source, text }: { source: SourceReference; text?: Snippet<[string]> | undefined } =
		$props();

	const safeUrl = $derived(safeExternalUrl(source.url));
	const favicon = $derived(sourceFavicon(source.url));
</script>

{#snippet plain(value: string)}{value}{/snippet}

<div class="source-reference">
	<span class="source-reference__title">
		{#if safeUrl}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- safeUrl is a validated external citation, not an app route. -->
			<a href={safeUrl} target="_blank" rel="noopener noreferrer">
				{#if favicon}
					<img class="source-reference__favicon" src={favicon} alt="" />
				{/if}
				{@render (text ?? plain)(source.pageTitle)}
				<ArrowSquareOutIcon
					class="source-reference__external"
					aria-hidden="true"
					size={11}
					weight="bold"
				/><!-- The mark is aria-hidden, so this note is the whole of what says the
				     press opens a tab, the convention every external link on the site
				     pages already follows. -->
				<span class="sr-only">(opens in a new tab)</span>
			</a>
		{:else}
			<span>{@render (text ?? plain)(source.pageTitle)}</span>
		{/if}
		<span class="source-reference__verified">
			verified <time datetime={source.lastVerifiedAt}>{source.lastVerifiedAt}</time>
		</span>
	</span>
	<span class="source-reference__section">{@render (text ?? plain)(source.sectionTitle)}</span>
</div>

<style>
	/*
	 * The block citation, which is no longer how a diagnostic shows its provenance:
	 * a diagnostic cites its source as a link on the meta line. What is left here
	 * serves the tools panel's reviewed-source snapshot, which is an inventory of
	 * every citation rather than one card's, and wants the verified date and the
	 * section on the page.
	 */
	.source-reference {
		display: grid;
		gap: 0.1rem;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.source-reference a {
		display: inline-flex;
		width: fit-content;
		gap: 0.25rem;
		align-items: center;
		font-weight: var(--font-weight-semibold);
	}

	.source-reference__title {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: baseline;
	}

	.source-reference :global(.source-reference__external) {
		flex: none;
	}

	/* The favicon at the text's own size, rounded as `SourceCitation.svelte`
	   rounds its own: half of `--radius-xs`, because at this size the full token
	   reads as a circle. */
	.source-reference__favicon {
		flex: none;
		width: 1em;
		height: 1em;
		border-radius: calc(var(--radius-xs) / 2);
	}

	.source-reference__verified {
		white-space: nowrap;
	}
</style>
