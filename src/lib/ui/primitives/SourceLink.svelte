<script lang="ts">
	import type { SourceReference } from '$lib/core/types.js';

	let { source }: { source: SourceReference } = $props();

	const safeUrl = $derived.by(() => {
		try {
			const url = new URL(source.url);
			return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
		} catch {
			return undefined;
		}
	});
</script>

<div class="source-reference">
	<span class="source-reference__title">
		{#if safeUrl}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={safeUrl} target="_blank" rel="noopener noreferrer">
				{source.pageTitle}
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
			<span>{source.pageTitle}</span>
		{/if}
		<span class="source-reference__verified">
			verified <time datetime={source.lastVerifiedAt}>{source.lastVerifiedAt}</time>
		</span>
	</span>
	<span class="source-reference__section">{source.sectionTitle}</span>
</div>
