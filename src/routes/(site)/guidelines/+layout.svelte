<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { safeDecodeHash } from '#lib/ui/site/hash.js';
	import { page } from '$app/state';
	import ReferenceIndex from '#lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '#lib/ui/site/SectionSplit.svelte';
	import type { LayoutProps } from './$types.js';
	let { children, data }: LayoutProps = $props();
	const musixmatch = $derived(
		page.url.pathname.includes('/guidelines/musixmatch/') ||
			page.params.rule?.startsWith('mxm-') === true
	);
	const corpus = $derived(musixmatch ? data.musixmatchCorpus : data.referenceCorpus);
	const musixmatchHome = `${resolve('/(site)/guidelines/musixmatch')}/`;
	const selectedTopic = $derived(
		page.params.topic ??
			(page.params.rule
				? corpus.find(
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
	$effect(() => {
		if (page.url.searchParams.get('profile') === 'musixmatch' && !musixmatch && !page.params.rule) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- Preserve query state on the resolved Musixmatch route.
			void goto(`${musixmatchHome}${page.url.search}`, { replaceState: true });
		}
	});
	const detailOpen = $derived(!/\/guidelines\/(?:musixmatch\/)?$/u.test(page.url.pathname));
</script>

<SectionSplit
	{detailOpen}
	{...musixmatch
		? {
				home: musixmatchHome,
				title: 'Musixmatch transcription guide',
				lede: 'Read the transcription requirements, language exceptions and what each check can establish.'
			}
		: {}}
>
	{#snippet list()}
		<ReferenceIndex
			{corpus}
			profile={musixmatch ? 'musixmatch' : 'genius'}
			showProfileNavigation
			spellings={data.spellings}
			selectedSlug={page.params.rule}
			{selectedTopic}
		/>
	{/snippet}
	{@render children()}
</SectionSplit>
