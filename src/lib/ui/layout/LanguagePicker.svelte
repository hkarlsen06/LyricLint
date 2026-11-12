<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import GlobeIcon from 'phosphor-svelte/lib/GlobeIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { filterLanguages, languages, languageName } from '#lib/languages/options.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import { isLanguageTag } from '#lib/languages/tag.js';
	import { onDestroy, tick } from 'svelte';

	let {
		language,
		recentLanguages: recent = [],
		onchoose,
		onopen = () => {},
		expandedLabel = false,
		label = 'Lyric language',
		dialogLabel,
		disabled = false,
		custom = false,
		showCoverage = false,
		scopeLanguages,
		message = '',
		context = '',
		triggerLabel,
		hideWhenUnavailable = false
	}: {
		language: string | undefined;
		recentLanguages?: readonly string[];
		onchoose: (tag: string) => boolean | void;
		onopen?: () => void;
		expandedLabel?: boolean;
		label?: string;
		dialogLabel?: string;
		disabled?: boolean;
		custom?: boolean;
		showCoverage?: boolean;
		scopeLanguages?: readonly string[];
		message?: string;
		context?: string;
		triggerLabel?: string;
		hideWhenUnavailable?: boolean;
	} = $props();
	const id = $props.id();
	let customCode = $state('');
	let codeError = $state('');

	let dialog: HTMLDialogElement;
	let trigger: HTMLButtonElement;
	let searchInput = $state<HTMLInputElement>();
	let query = $state('');
	let isOpen = $state(false);
	let focusFrame = 0;
	function cancelFocusRestore(): void {
		if (focusFrame) cancelAnimationFrame(focusFrame);
		focusFrame = 0;
	}
	onDestroy(cancelFocusRestore);

	function restoreTriggerFocus(): void {
		cancelFocusRestore();
		const previousFocus = document.activeElement;
		function restore(): void {
			focusFrame = 0;
			if (
				dialog.open ||
				!trigger.isConnected ||
				trigger.disabled ||
				trigger.getClientRects().length === 0 ||
				(document.activeElement !== previousFocus &&
					document.activeElement !== document.body &&
					!dialog.contains(document.activeElement))
			)
				return;
			if (getComputedStyle(trigger).visibility === 'hidden') {
				focusFrame = requestAnimationFrame(restore);
				return;
			}
			trigger.focus({ preventScroll: true });
		}
		restore();
	}

	const recentLanguages = $derived(recent.map((tag) => [tag, languageName(tag)] as const));
	const allLanguages = $derived(languages.filter(([tag]) => !recent.includes(tag)));
	const searchableLanguages = $derived([
		...recentLanguages,
		...languages.filter(([tag]) => !recent.includes(tag))
	]);
	const filteredLanguages = $derived(filterLanguages(searchableLanguages, query));

	const selectedLabel = $derived(
		language === undefined ? 'Mixed languages' : languageName(language)
	);
	const checkingLanguages = $derived(scopeLanguages ?? (language === undefined ? [] : [language]));

	// What the results say, as one sentence. The no-match case is the visible
	// message verbatim: a reader who cannot see it is owed the same answer, not a
	// count of zero.
	const resultsStatus = $derived(
		filteredLanguages.length === 0
			? `No languages match “${query.trim()}”.`
			: `${filteredLanguages.length} ${filteredLanguages.length === 1 ? 'language matches' : 'languages match'}.`
	);

	async function open(): Promise<void> {
		cancelFocusRestore();
		onopen();
		trigger.focus({ preventScroll: true });
		customCode = '';
		codeError = '';
		query = '';
		isOpen = true;
		dialog.showModal();
		await tick();
		searchInput?.focus();
	}

	function close(): void {
		dialog.close();
		restoreTriggerFocus();
	}

	function choose(tag: string): void {
		if (onchoose(tag) !== false) close();
	}

	function chooseCustom(): void {
		if (!isLanguageTag(customCode)) {
			codeError = 'Choose a valid language code.';
			return;
		}
		codeError = '';
		choose(customCode);
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === dialog) close();
	}

	function handleSearchKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (event.key !== 'ArrowDown') return;
		const firstResult = dialog.querySelector<HTMLButtonElement>('.language-option');
		if (!firstResult) return;
		event.preventDefault();
		firstResult.focus();
	}
</script>

{#snippet coverage()}
	{#each checkingLanguages as tag (tag)}
		<p class="language-coverage">
			{#if profileLanguage(tag) === 'und'}{languageName(tag)}: language-independent checks and
				conversion only.
			{:else}Reviewed language-specific rules for {languageName(tag)}.{/if}
		</p>
	{/each}
{/snippet}

{#snippet languageOption(tag: string, name: string)}
	<li>
		<button
			type="button"
			class="language-option"
			class:selected={tag === language}
			aria-label={name}
			aria-describedby={profileLanguage(tag) === 'und' ? `${id}-${tag}-coverage` : undefined}
			aria-current={tag === language ? 'true' : undefined}
			onclick={() => choose(tag)}
		>
			<span
				>{name}{#if profileLanguage(tag) === 'und'}<small id={`${id}-${tag}-coverage`}
						>Language-independent only</small
					>{/if}</span
			>
			<span class="language-option__meta">
				<code>{tag}</code>
				{#if tag === language}
					<CheckIcon aria-label="Selected" size={16} weight="bold" />
				{/if}
			</span>
		</button>
	</li>
{/snippet}

<button
	bind:this={trigger}
	type="button"
	class="button button--quiet language-trigger"
	aria-haspopup="dialog"
	hidden={hideWhenUnavailable && disabled && !isOpen}
	{disabled}
	aria-label={`${label}: ${selectedLabel}`}
	onmousedown={(event) => event.preventDefault()}
	onclick={open}
>
	<GlobeIcon aria-hidden="true" size={16} weight="bold" />
	<span class="language-trigger__label" aria-hidden="true"
		>{triggerLabel ??
			(language === undefined
				? selectedLabel
				: expandedLabel
					? `${label}: ${selectedLabel}`
					: language)}</span
	>
</button>
{#if showCoverage}{@render coverage()}{/if}

<dialog
	bind:this={dialog}
	class="language-dialog"
	aria-labelledby={`${id}-title`}
	onclick={handleBackdropClick}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={(event) => {
		isOpen = event.currentTarget.open;
		if (
			!isOpen &&
			trigger?.isConnected &&
			(document.activeElement === document.body ||
				event.currentTarget.contains(document.activeElement))
		) {
			restoreTriggerFocus();
		}
	}}
>
	{#if isOpen}
		<div class="language-dialog__surface">
			<div class="language-dialog__header">
				<strong id={`${id}-title`}>{dialogLabel ?? label}</strong>
				<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
					<XIcon aria-hidden="true" size={16} weight="bold" />
				</button>
			</div>

			<label class="language-search" for={`${id}-search`}>
				<MagnifyingGlassIcon aria-hidden="true" size={16} weight="bold" />
				<input
					bind:this={searchInput}
					bind:value={query}
					id={`${id}-search`}
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
				<p role="status">{message}</p>
				{#if context}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (The labelled scroll region accepts keyboard navigation.) -->
					<p class="language-context" role="region" aria-label="Selected lyrics" tabindex="0">
						{context}
					</p>
				{/if}
				{@render coverage()}
				{#if custom}
					<details class="disclosure">
						<summary>Custom language code</summary>
						<p>Codes without reviewed rules use language-independent checks and conversion only.</p>
						<label
							>Language code<input
								bind:value={customCode}
								oninput={() => (codeError = '')}
								aria-invalid={codeError ? 'true' : undefined}
								aria-describedby={codeError ? `${id}-code-error` : undefined}
								spellcheck="false"
								placeholder="For example, fr-CA"
							/></label
						>
						<button type="button" class="button" disabled={!customCode} onclick={chooseCustom}
							>Use custom code</button
						>
						<p id={`${id}-code-error`} role="status">{codeError}</p>
					</details>
				{/if}
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
								<li class="language-group language-group--all" role="presentation">
									All languages
								</li>
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
	{/if}
</dialog>

<style>
	.language-coverage,
	.language-option small {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
	.language-option small {
		display: block;
	}
	.language-coverage {
		overflow-wrap: anywhere;
	}
	.language-context {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 4lh;
		overflow: auto;
	}
	.language-trigger {
		max-width: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
		/* The native tap flash can outlive this trigger beneath its opened modal. */
		-webkit-tap-highlight-color: transparent;
	}

	.language-trigger[hidden] {
		display: none;
	}

	.language-trigger :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	.language-trigger__label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.language-dialog {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		height: min(38rem, calc(100dvh - var(--space-6)));
		max-height: none;
		padding: 0;
		border: 0;
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
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
		align-items: center;
		justify-content: space-between;
	}

	.language-dialog__header strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.language-search {
		display: grid;
		margin: var(--space-2) var(--space-5) var(--space-3);
		grid-template-columns: auto minmax(0, 1fr);
		border: var(--border-width) solid transparent;
		box-shadow: var(--shadow-control);
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
		font-size: var(--font-size-md);
		border: 0;
		background: transparent;
		box-shadow: none;
		outline: 0;
	}

	.language-results {
		min-height: 0;
		overflow-y: auto;
		padding: 0 var(--space-3) var(--space-3);
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
		background: var(--color-fill);
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
		color: var(--color-text);
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
	@media (pointer: coarse) {
		.language-option {
			min-height: var(--control-height-touch);
		}
		.language-results summary {
			min-height: var(--control-height-touch);
			align-content: center;
		}
		/* Match the scoped field selector: its generated class outranks the
		   workbench's generic input floor. */
		.language-search input {
			font-size: var(--font-size-lg);
		}
	}
</style>
