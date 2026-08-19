<script lang="ts">
	import { Check, Globe, Search, X } from 'lucide-svelte';
	import { getLanguagePack } from '$lib/languages/registry.js';
	import { languageSourceInventory } from '$lib/languages/inventory.js';
	import { tick } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	let dialog: HTMLDialogElement;
	let trigger: HTMLButtonElement;
	let searchInput: HTMLInputElement;
	let query = $state('');

	const languages: readonly (readonly [string, string])[] = [
		['en', 'English'],
		['en-US', 'English (United States)'],
		['en-GB', 'English (United Kingdom)'],
		...languageSourceInventory
			.filter((entry) => entry.tag !== 'en')
			.map((entry) => [entry.tag, entry.language] as const)
	];

	function normalize(value: string): string {
		return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
	}

	function languageName(tag: string): string {
		return (
			languages.find(([candidate]) => candidate === tag)?.[1] ??
			getLanguagePack(tag).displayName ??
			tag
		);
	}

	const recentLanguages = $derived(
		controller.recentLanguages.map((tag) => [tag, languageName(tag)] as const)
	);
	const allLanguages = $derived(
		languages.filter(([tag]) => !controller.recentLanguages.includes(tag))
	);
	const searchableLanguages = $derived([
		...recentLanguages,
		...languages.filter(([tag]) => !controller.recentLanguages.includes(tag))
	]);
	const filteredLanguages = $derived.by(() => {
		const needle = normalize(query);
		if (!needle) return searchableLanguages;
		return searchableLanguages.filter(([tag, name]) =>
			normalize(`${name} ${tag}`).includes(needle)
		);
	});

	const selectedLabel = $derived(languageName(controller.language));

	// What the results say, as one sentence. The no-match case is the visible
	// message verbatim: a reader who cannot see it is owed the same answer, not a
	// count of zero.
	const resultsStatus = $derived(
		filteredLanguages.length === 0
			? `No languages match “${query.trim()}”.`
			: `${filteredLanguages.length} ${filteredLanguages.length === 1 ? 'language matches' : 'languages match'}.`
	);

	async function open(): Promise<void> {
		query = '';
		dialog.showModal();
		await tick();
		searchInput.focus();
	}

	function close(): void {
		dialog.close();
		trigger.focus();
	}

	function choose(tag: string): void {
		controller.setLanguage(tag);
		close();
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === dialog) close();
	}

	function handleSearchKeydown(event: KeyboardEvent): void {
		if (event.key !== 'ArrowDown') return;
		const firstResult = dialog.querySelector<HTMLButtonElement>('.language-option');
		if (!firstResult) return;
		event.preventDefault();
		firstResult.focus();
	}
</script>

{#snippet languageOption(tag: string, name: string)}
	<li>
		<button
			type="button"
			class="language-option"
			class:selected={tag === controller.language}
			aria-label={name}
			aria-current={tag === controller.language ? 'true' : undefined}
			onclick={() => choose(tag)}
		>
			<span>{name}</span>
			<span class="language-option__meta">
				<code>{tag}</code>
				{#if tag === controller.language}
					<Check aria-label="Selected" size={16} strokeWidth={2.4} />
				{/if}
			</span>
		</button>
	</li>
{/snippet}

<button
	bind:this={trigger}
	type="button"
	class="button language-trigger"
	aria-haspopup="dialog"
	aria-label={`Lyric language: ${selectedLabel}`}
	onclick={open}
>
	<Globe aria-hidden="true" size={15} strokeWidth={2.1} />
	<span aria-hidden="true">{controller.language}</span>
</button>

<dialog
	bind:this={dialog}
	class="language-dialog"
	aria-labelledby="language-dialog-title"
	onclick={handleBackdropClick}
>
	<div class="language-dialog__surface">
		<div class="language-dialog__header">
			<strong id="language-dialog-title">Lyric language</strong>
			<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
				<X aria-hidden="true" size={16} strokeWidth={2.25} />
			</button>
		</div>

		<label class="language-search" for="language-search-input">
			<Search aria-hidden="true" size={16} strokeWidth={2.25} />
			<input
				bind:this={searchInput}
				bind:value={query}
				id="language-search-input"
				type="search"
				placeholder="Search languages"
				autocomplete="off"
				spellcheck="false"
				onkeydown={handleSearchKeydown}
			/>
		</label>

		<!-- The count is the live region, never the list. Wrapped around the results
		     themselves, every keystroke re-rendered dozens of options inside a
		     polite region and queued the whole catalogue to be read out; what the
		     typist actually wants to hear is how many are left. Mounted at every
		     state and empty until it has something to say, because a live region
		     that arrives with its text already in it is not announced. -->
		<p class="sr-only" role="status">
			{query.trim().length === 0 ? '' : resultsStatus}
		</p>

		<div class="language-results">
			{#if filteredLanguages.length}
				<ul aria-label="Languages">
					{#if query.trim().length === 0}
						{#if recentLanguages.length}
							<li class="language-group" role="presentation">Recent</li>
							{#each recentLanguages as [tag, name] (tag)}
								{@render languageOption(tag, name)}
							{/each}
						{/if}
						{#if allLanguages.length}
							<li class="language-group language-group--all" role="presentation">All languages</li>
							{#each allLanguages as [tag, name] (tag)}
								{@render languageOption(tag, name)}
							{/each}
						{/if}
					{:else}
						{#each filteredLanguages as [tag, name] (tag)}
							{@render languageOption(tag, name)}
						{/each}
					{/if}
				</ul>
			{:else}
				<p class="language-empty">No languages match “{query.trim()}”.</p>
			{/if}
		</div>
	</div>
</dialog>

<style>
	.language-trigger {
		white-space: nowrap;
	}

	.language-trigger :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	.language-dialog {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		height: min(38rem, calc(100dvh - var(--space-6)));
		max-height: none;
		padding: 0;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.language-dialog::backdrop {
		background: var(--color-backdrop);
	}

	.language-dialog__surface {
		display: grid;
		height: 100%;
		grid-template-rows: auto auto minmax(0, 1fr);
	}

	.language-dialog__header {
		display: flex;
		min-height: 3.25rem;
		padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
		border-bottom: var(--border-width) solid var(--color-border);
		align-items: center;
		justify-content: space-between;
	}

	.language-dialog__header strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
	}

	.language-search {
		display: grid;
		margin: var(--space-3);
		grid-template-columns: auto minmax(0, 1fr);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-control);
		background: var(--color-control);
		align-items: center;
	}

	.language-search:focus-within {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.language-search :global(svg) {
		margin-inline-start: var(--space-2-5);
		color: var(--color-text-muted);
	}

	.language-search input {
		min-width: 0;
		border: 0;
		background: transparent;
		outline: 0;
	}

	.language-results {
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--space-2) var(--space-2);
	}

	.language-results ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.language-group {
		padding: var(--space-2) var(--space-2-5) var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}

	.language-group--all {
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: var(--border-width) solid var(--color-border);
	}

	.language-option {
		display: flex;
		width: 100%;
		min-height: var(--control-height-lg);
		padding: var(--space-2) var(--space-2-5);
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--color-text);
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		text-align: start;
	}

	.language-option:hover,
	.language-option:focus-visible {
		background: var(--color-control-hover);
	}

	.language-option.selected {
		background: var(--color-selected);
		font-weight: var(--font-weight-semibold);
	}

	.language-option__meta {
		display: inline-flex;
		flex: none;
		gap: var(--space-2);
		align-items: center;
		color: var(--color-text-muted);
	}

	.language-option__meta code {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.language-option.selected .language-option__meta {
		color: var(--color-accent);
	}

	.language-empty {
		margin: var(--space-5) var(--space-3);
		color: var(--color-text-muted);
		text-align: center;
	}

	@media (max-width: 36rem) {
		.language-dialog {
			width: calc(100vw - var(--space-2));
			height: calc(100dvh - var(--space-2));
		}
	}
</style>
