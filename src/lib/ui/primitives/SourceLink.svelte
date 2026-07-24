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
	{#if safeUrl}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={safeUrl} target="_blank" rel="noopener noreferrer">{source.pageTitle}</a>
	{:else}
		<span>{source.pageTitle}</span>
	{/if}
	<span>{source.sectionTitle}</span>
	<span>Verified <time datetime={source.lastVerifiedAt}>{source.lastVerifiedAt}</time></span>
</div>
