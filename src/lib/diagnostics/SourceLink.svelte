<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import { safeExternalUrl } from './source-url.js';

	/**
	 * How the two strings on this block are drawn, for a surface that has
	 * something to say about them.
	 *
	 * The rule reference searches its citations along with everything else on the
	 * page, so the page a search opens has to be able to mark the words that
	 * matched — and a citation reading `Song Headers in Different Languages`
	 * against a query of `languages` with nothing marked on it is the failure that
	 * widening the search was supposed to remove, arriving from the other side.
	 *
	 * A snippet rather than this component reaching for the marker itself, because
	 * `src/lib/diagnostics/` sits outside `src/lib/ui/` on purpose: the editor may
	 * not depend on the shell, and the linter's popover draws this same block. So
	 * the surface that knows about a query passes one in, and the two that do not
	 * — the popover and the tools panel — get the text.
	 */
	let { source, text }: { source: SourceReference; text?: Snippet<[string]> | undefined } =
		$props();

	const safeUrl = $derived(safeExternalUrl(source.url));
</script>

{#snippet plain(value: string)}{value}{/snippet}

<div class="source-reference">
	<span class="source-reference__title">
		{#if safeUrl}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={safeUrl} target="_blank" rel="noopener noreferrer">
				{@render (text ?? plain)(source.pageTitle)}
				<svg
					class="source-reference__external"
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="11"
					height="11"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M6.5 3.5H3.6a1.1 1.1 0 0 0-1.1 1.1v7.8a1.1 1.1 0 0 0 1.1 1.1h7.8a1.1 1.1 0 0 0 1.1-1.1V9.5"
					/>
					<path d="M9.5 2.5h4v4M13.2 2.8 7.5 8.5" />
				</svg>
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
