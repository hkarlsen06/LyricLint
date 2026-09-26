<script lang="ts">
	/**
	 * The docs' search, opened from the sidebar's field, `Mod-K`, or `/` (the
	 * last only when the reader is not typing somewhere). Results are ranked by
	 * `searchDocs`; the transcription guide is always offered for the same
	 * words, because a question about a convention belongs there.
	 */
	import { resolve } from '$app/paths';
	import { emptyReferenceSearch, referenceSearchHref } from '$lib/ui/site/reference-url.js';
	import * as Command from '$lib/ui/primitives/command/index.js';
	import { searchDocs } from './docs-search.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let query = $state('');
	const hits = $derived(searchDocs(query));
	const trimmed = $derived(query.trim());
	const guideHref = $derived(
		referenceSearchHref(resolve('/guidelines/'), { ...emptyReferenceSearch(), query: trimmed })
	);

	function typingIn(target: EventTarget | null): boolean {
		return (
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function shortcut(event: KeyboardEvent): void {
		if (open || event.defaultPrevented || event.altKey || event.shiftKey) return;
		const modK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
		const slash =
			event.key === '/' && !event.metaKey && !event.ctrlKey && !typingIn(event.target);
		if (!modK && !slash) return;
		event.preventDefault();
		open = true;
	}

	function close(): void {
		open = false;
	}
</script>

<svelte:window onkeydown={shortcut} />

<Command.Dialog
	bind:open
	shouldFilter={false}
	title="Search the docs"
	description="Find a page or a section of the LyricLint docs."
	onOpenChange={(next) => {
		if (!next) query = '';
	}}
>
	<Command.Input placeholder="Search the docs" bind:value={query} />
	<Command.List>
		{#if hits.length > 0}
			<Command.Group heading={trimmed ? 'Docs' : 'All pages'}>
				{#each hits as hit (`${hit.page.slug}#${hit.section?.id ?? ''}`)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- both halves come from resolve(); the fragment is a catalog section id. -->
					<Command.LinkItem
						href={hit.section
							? `${resolve(`/docs/${hit.page.slug}/`)}#${hit.section.id}`
							: resolve(`/docs/${hit.page.slug}/`)}
						value={`${hit.page.slug}#${hit.section?.id ?? ''}`}
						onSelect={close}
					>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<span class="docs-search__title">{hit.section?.title ?? hit.page.title}</span>
						<span class="docs-search__detail">
							{hit.section ? hit.page.title : hit.page.summary}
						</span>
					</Command.LinkItem>
				{/each}
			</Command.Group>
		{/if}
		{#if trimmed}
			<Command.Group heading="Transcription guide">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- referenceSearchHref only adds the query to a resolve() path. -->
				<Command.LinkItem href={guideHref} value="guide" onSelect={close}>
					<span class="docs-search__title">Search the guide for “{trimmed}”</span>
					<span class="docs-search__detail">
						{hits.length > 0
							? 'Genius conventions and the checks behind every finding'
							: 'Nothing in the docs matches. The guide covers Genius conventions and checks.'}
					</span>
				</Command.LinkItem>
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog>

<style>
	.docs-search__title {
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	.docs-search__detail {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-tight);
	}
</style>
