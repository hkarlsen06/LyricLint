<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { safeDecodeHash } from '#lib/ui/site/hash.js';
	import { page } from '$app/state';
	import ReferenceIndex from '#lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '#lib/ui/site/SectionSplit.svelte';
	import type { LayoutProps } from './$types.js';
	let { children, data }: LayoutProps = $props();
	const selectedTopic = $derived(
		page.params.topic ??
			(page.params.rule
				? data.referenceCorpus.find(
						(doc) => doc.kind === 'rule' && doc.href.endsWith(`/checks/${page.params.rule}/`)
					)?.topic
				: undefined)
	);
	// Older bookmarks could name any convention from the continuous root or topic reader.
	afterNavigate(() => {
		const anchor = safeDecodeHash(location.hash.slice(1));
		if (!anchor || document.getElementById(anchor)) return;
		const entry = data.referenceCorpus.find(
			(doc) => doc.kind === 'guideline' && doc.href.split('#')[1] === anchor
		);
		if (!entry) return;
		const hashAt = entry.href.indexOf('#');
		const destination = `${resolve('/(site)')}${entry.href.slice(1, hashAt)}${location.search}${entry.href.slice(hashAt)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- Server-derived local entry URL with the configured base.
		void goto(destination, { replace: true });
	});
	const detailOpen = $derived(!/\/guidelines\/?$/u.test(page.url.pathname));
</script>

<SectionSplit {detailOpen}>
	{#snippet list()}
		<ReferenceIndex corpus={data.referenceCorpus} selectedSlug={page.params.rule} {selectedTopic} />
	{/snippet}
	{@render children()}
</SectionSplit>
