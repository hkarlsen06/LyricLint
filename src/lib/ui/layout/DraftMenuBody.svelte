<script lang="ts">
	import type { DraftSummary } from '#lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import RemoveButton from '#lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '#lib/ui/drafts/draft-date.js';
	import { tick } from 'svelte';
	import { profileLabels } from '#lib/profiles/types.js';
	import { otherProfile } from '#lib/persistence/writing.js';

	let {
		controller,
		open,
		onClose,
		menuTrigger
	}: {
		controller: WorkbenchController;
		open: boolean;
		onClose: () => void;
		menuTrigger?: HTMLElement;
	} = $props();

	let renameId = $state<string | undefined>();
	let renameValue = $state('');
	let deleteId = $state<string | undefined>();
	let actionsId = $state<string | undefined>();
	let query = $state('');
	const filteredDrafts = $derived(
		controller.drafts.filter((draft) =>
			`${draft.title} ${draft.searchText ?? ''}`
				.toLocaleLowerCase()
				.includes(query.trim().toLocaleLowerCase())
		)
	);
	const duplicateTitles = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local accumulator; the complete result is derived from the library
		const counts = new Map<string, number>();
		for (const draft of controller.drafts) {
			const title = draft.title.trim().toLocaleLowerCase();
			counts.set(title, (counts.get(title) ?? 0) + 1);
		}
		return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title));
	});
	const searchAvailable = $derived(controller.drafts.length >= 5 || query !== '');

	$effect(() => {
		if (!open) {
			query = '';
			renameId = undefined;
			deleteId = undefined;
			actionsId = undefined;
		}
	});

	function beginRename(id: string, title: string): void {
		renameId = id;
		renameValue = title;
		deleteId = undefined;
		actionsId = undefined;
	}

	async function submitRename(event: SubmitEvent, id: string): Promise<void> {
		event.preventDefault();
		const row = event.currentTarget instanceof Element ? event.currentTarget.closest('li') : null;
		await controller.renameDraft(id, renameValue);
		if (renameId === id) await finishRename(row);
	}

	async function finishRename(row: Element | null): Promise<void> {
		renameId = undefined;
		await tick();
		if (open && row?.isConnected)
			row.querySelector<HTMLButtonElement>('.draft-menu__actions-trigger')?.focus();
	}

	function toggleActions(id: string): void {
		renameId = undefined;
		deleteId = undefined;
		actionsId = actionsId === id ? undefined : id;
	}

	/** The rename field replaces the row, so it takes the row's focus with it. */
	function focusRenameField(node: HTMLInputElement): void {
		node.focus();
		node.select();
	}

	/** Close the popover for actions that switch the active document. */
	function closeAnd(action: () => Promise<void>): Promise<void> {
		onClose();
		return action();
	}

	async function deleteDraftAndMoveFocus(id: string, trigger: HTMLButtonElement): Promise<void> {
		const nextDraft = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('.list-row__action');
		await controller.deleteDraft(id);
		deleteId = undefined;
		actionsId = undefined;
		await tick();
		if (nextDraft?.isConnected) {
			nextDraft.focus();
		} else {
			menuTrigger?.focus();
		}
	}
</script>

<!-- The name and the date are one line whether or not the row is pressable, so
     the confirm step can take the press away without moving anything. -->
{#snippet identity(draft: DraftSummary)}
	{#if draft.lyricPreview && duplicateTitles.has(draft.title.trim().toLocaleLowerCase())}
		<span class="draft-menu__identity">
			<span class="list-row__name">{draft.title}</span>
			<span class="draft-menu__preview" title={draft.lyricPreview}>{draft.lyricPreview}</span>
		</span>
	{:else}
		<span class="list-row__name">{draft.title}</span>
	{/if}
	<!-- The format rides beside the date on every row: two versions of one song
	     share a title and an opening line, and this is the only thing that
	     tells them apart before one is opened. -->
	<span class="draft-menu__facts">
		<span class="draft-menu__format"
			>{profileLabels[draft.profile]}{#if draft.exported}&nbsp;<span class="draft-menu__export"
					>+ {profileLabels[otherProfile(draft.profile)]}<span class="sr-only"> export</span></span
				>{/if}</span
		>
		<time datetime={draft.updatedAt} title={fullDraftDate(draft.updatedAt)}>
			{formatDraftDate(draft.updatedAt)}
		</time>
	</span>
{/snippet}

{#if searchAvailable}
	<label class="sr-only" for="draft-search">Find a saved 'scribe by title or lyrics</label>
	<input
		id="draft-search"
		class="draft-menu__search"
		type="search"
		placeholder="Title or lyrics…"
		bind:value={query}
		oninput={() => {
			renameId = undefined;
			deleteId = undefined;
			actionsId = undefined;
		}}
	/>
{/if}
{#if controller.drafts.length === 0}
	<p class="empty-state">No saved 'scribes yet. This one will appear after its first local save.</p>
{:else if filteredDrafts.length === 0}
	<p class="empty-state" role="status">No saved 'scribes match “{query.trim()}”.</p>
{:else}
	<ul class="draft-list">
		{#each filteredDrafts as draft (draft.id)}
			<li class="list-row draft-menu__row" class:current={draft.id === controller.draftId}>
				{#if renameId === draft.id}
					<form class="list-row__form" onsubmit={(event) => submitRename(event, draft.id)}>
						<label class="sr-only" for={`rename-${draft.id}`}>'Scribe title</label>
						<input id={`rename-${draft.id}`} bind:value={renameValue} {@attach focusRenameField} />
						<button class="button button--contrast" type="submit">Save</button>
						<button
							class="button button--quiet"
							type="button"
							onclick={(event) => finishRename(event.currentTarget.closest('li'))}>Cancel</button
						>
					</form>
				{:else}
					<div class="draft-menu__row-main">
						{#if deleteId === draft.id}
							<span class="list-row__action list-row__action--static"
								>{@render identity(draft)}</span
							>
						{:else}
							<button
								type="button"
								class="list-row__action"
								aria-current={draft.id === controller.draftId ? 'page' : undefined}
								onclick={() => closeAnd(() => controller.openDraft(draft.id))}
							>
								{@render identity(draft)}
							</button>
							<button
								type="button"
								class="button button--quiet draft-menu__actions-trigger"
								aria-label="Actions for {draft.title}"
								aria-expanded={actionsId === draft.id}
								aria-controls={`draft-actions-${draft.id}`}
								onclick={() => toggleActions(draft.id)}>Actions</button
							>
						{/if}
					</div>
					<div
						id={`draft-actions-${draft.id}`}
						class="draft-menu__actions"
						role="group"
						aria-label="Actions for {draft.title}"
						hidden={actionsId !== draft.id}
					>
						{#if actionsId === draft.id}
							{#if deleteId !== draft.id}
								<button
									type="button"
									class="button button--quiet"
									aria-label="Rename {draft.title}"
									onclick={() => beginRename(draft.id, draft.title)}>Rename</button
								>
								<button
									type="button"
									class="button button--quiet"
									aria-label="Duplicate {draft.title}"
									onclick={() => closeAnd(() => controller.duplicateDraft(draft.id))}
									>Duplicate</button
								>
								<button
									type="button"
									class="button button--quiet"
									aria-label="Export Scribe for {draft.title}"
									onclick={() => controller.exportScribe(draft.id)}>Export Scribe</button
								>
							{/if}
							<RemoveButton
								subject={draft.title}
								showLabel
								pending={deleteId === draft.id}
								onRequest={() => {
									renameId = undefined;
									deleteId = draft.id;
								}}
								onCancel={() => (deleteId = undefined)}
								onConfirm={(trigger) => deleteDraftAndMoveFocus(draft.id, trigger)}
							/>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<!-- No `Delete all local data…` here. It was a footer under this list, and on
		     a fresh install it was the whole menu: a sentence saying there are no
		     'scribes yet, and a red button offering to delete them. The one thing a
		     first-timer opening this out of curiosity met was the most destructive
		     command in the application, pointed at nothing. It lives under `Local
		     data` in the tools panel, where the paragraph above it says what local
		     data is: a claim is made once, where the reader is deciding. -->
<style>
	.draft-menu__row {
		display: block;
	}
	.draft-menu__row-main {
		display: flex;
		min-height: var(--control-height-sm);
		gap: var(--space-2);
		align-items: center;
	}
	.draft-menu__actions-trigger {
		flex: none;
		min-height: var(--control-height-sm);
		padding-block: 0;
		padding-inline: var(--space-3);
		font-size: var(--font-size-sm);
	}
	.draft-menu__actions {
		display: flex;
		min-height: var(--control-height-sm);
		gap: var(--space-1);
		justify-content: flex-end;
		align-items: center;
		margin-block-start: var(--space-2);
	}
	.draft-menu__actions[hidden] {
		display: none;
	}
	.draft-menu__actions > .button {
		min-height: var(--control-height-sm);
		padding-block: 0;
		font-size: var(--font-size-sm);
		padding-inline: var(--space-3);
	}
	@media (pointer: coarse) and (max-width: 68rem) {
		.draft-menu__row-main {
			min-height: var(--control-height-touch);
		}
		.draft-menu__actions > .button,
		.draft-menu__actions-trigger {
			min-height: var(--control-height-touch);
		}
	}
	@media (max-width: 40rem) {
		.draft-menu__actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-auto-rows: var(--control-height-touch);
		}
		.draft-menu__actions :global(.remove-button__question) {
			grid-column: 1 / -1;
			min-height: var(--control-height-touch);
			align-content: center;
			margin: 0;
		}
	}
	.draft-menu__search {
		width: 100%;
		margin-block: var(--space-2);
		font-size: var(--font-size-editor);
	}

	.draft-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* The draft being edited is the one the whole window is about, so it is the
	   one name in the list drawn at full weight. */
	.draft-list > li.current .list-row__name {
		font-weight: var(--font-weight-semibold);
	}

	.draft-menu__facts {
		display: flex;
		flex: none;
		gap: var(--space-2);
		align-items: baseline;
	}
	/* A categorical chip, not a control: the same fill a finding's line tag takes. */
	.draft-menu__format {
		padding: 0 var(--space-1-5);
		border-radius: var(--radius-pill);
		background: var(--color-fill);
		color: var(--color-text);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-ui);
		white-space: nowrap;
	}
	.draft-menu__export {
		color: var(--color-text-muted);
		font-weight: var(--font-weight-regular);
	}
	.draft-menu__identity {
		display: grid;
		min-width: 0;
		gap: var(--space-0-5);
	}
	.draft-menu__preview {
		overflow: hidden;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
