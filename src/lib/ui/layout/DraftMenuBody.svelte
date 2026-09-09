<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Download from 'lucide-svelte/icons/download';
	import Pencil from 'lucide-svelte/icons/pencil';
	import type { DraftSummary } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';
	import { tick } from 'svelte';

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
	let query = $state('');
	const filteredDrafts = $derived(
		controller.drafts.filter((draft) =>
			`${draft.title} ${draft.lyricPreview ?? ''}`
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
		}
	});

	function beginRename(id: string, title: string): void {
		renameId = id;
		renameValue = title;
		deleteId = undefined;
	}

	async function submitRename(event: SubmitEvent, id: string): Promise<void> {
		event.preventDefault();
		await controller.renameDraft(id, renameValue);
		renameId = undefined;
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
	<time datetime={draft.updatedAt} title={fullDraftDate(draft.updatedAt)}>
		{formatDraftDate(draft.updatedAt)}
	</time>
{/snippet}

{#if searchAvailable}
	<label class="sr-only" for="draft-search">Find a saved 'scribe by title or opening lyrics</label>
	<input
		id="draft-search"
		class="draft-menu__search"
		type="search"
		placeholder="Title or opening lyrics…"
		bind:value={query}
		oninput={() => {
			renameId = undefined;
			deleteId = undefined;
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
			<li class="list-row" class:current={draft.id === controller.draftId}>
				{#if renameId === draft.id}
					<form class="list-row__form" onsubmit={(event) => submitRename(event, draft.id)}>
						<label class="sr-only" for={`rename-${draft.id}`}>'Scribe title</label>
						<input id={`rename-${draft.id}`} bind:value={renameValue} {@attach focusRenameField} />
						<button class="button button--contrast" type="submit">Save</button>
						<button
							class="button button--quiet"
							type="button"
							onclick={() => (renameId = undefined)}
						>
							Cancel
						</button>
					</form>
				{:else}
					<!-- The row stops being a way into the draft while its deletion is
							     the question: one decision on screen, and the confirm sits in
							     the slot the trigger just vacated. -->
					{#if deleteId === draft.id}
						<span class="list-row__action list-row__action--static">
							{@render identity(draft)}
						</span>
					{:else}
						<button
							type="button"
							class="list-row__action"
							aria-current={draft.id === controller.draftId ? 'page' : undefined}
							onclick={() => closeAnd(() => controller.openDraft(draft.id))}
						>
							{@render identity(draft)}
						</button>
					{/if}
					<!-- Icons, not four words per row: the labels repeated down the
							     list were the list, and the draft's own name had to compete
							     with them. Each one keeps the draft in its accessible name so
							     "Rename" alone is never all a screen reader hears. -->
					<div class="list-row__commands">
						<!-- Only the competing commands go while the confirm is pending.
								     The `RemoveButton` itself stays the same instance across the
								     arming, which is what the roster and the recent-drafts list
								     already do and what this menu got wrong: mounted afresh with
								     `pending` already true, its live region was *born* holding
								     the question, and a region that never changes announces
								     nothing. -->
						{#if deleteId !== draft.id}
							<button
								type="button"
								class="button--quiet icon-button"
								aria-label="Rename {draft.title}"
								title="Rename"
								onclick={() => beginRename(draft.id, draft.title)}
							>
								<Pencil aria-hidden="true" size={14} strokeWidth={2.25} />
							</button>
							<button
								type="button"
								class="button--quiet icon-button"
								aria-label="Duplicate {draft.title}"
								title="Duplicate"
								onclick={() => controller.duplicateDraft(draft.id)}
							>
								<Copy aria-hidden="true" size={14} strokeWidth={2.25} />
							</button>
							<button
								type="button"
								class="button--quiet icon-button"
								aria-label="Export {draft.title}"
								title="Export Scribe (.lls)"
								onclick={() => controller.exportScribe(draft.id)}
							>
								<Download aria-hidden="true" size={14} strokeWidth={2.25} />
							</button>
						{/if}
						<RemoveButton
							subject={draft.title}
							pending={deleteId === draft.id}
							onRequest={() => {
								renameId = undefined;
								deleteId = draft.id;
							}}
							onCancel={() => (deleteId = undefined)}
							onConfirm={(trigger) => deleteDraftAndMoveFocus(draft.id, trigger)}
						/>
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
		     data is — a claim is made once, where the reader is deciding. -->
<style>
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
