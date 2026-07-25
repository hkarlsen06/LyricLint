<script lang="ts">
	import type { DraftSummary } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';
	import { tick } from 'svelte';

	let { controller, open = $bindable(false) }: { controller: WorkbenchController; open?: boolean } =
		$props();

	let renameId = $state<string | undefined>();
	let renameValue = $state('');
	let deleteId = $state<string | undefined>();
	let confirmDeleteAll = $state(false);
	let menuTrigger: HTMLElement;

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
		open = false;
		return action();
	}

	// A press outside the menu closes it. The attachment sits on the `<details>`,
	// so a press on the summary is inside and the native toggle still owns it.
	// Leaving the menu abandons any pending confirm too — reopening it must not
	// present a primed "Delete all" the user has already walked away from.
	function dismiss(): void {
		if (!open) {
			return;
		}
		open = false;
		renameId = undefined;
		deleteId = undefined;
		confirmDeleteAll = false;
	}

	async function deleteDraftAndMoveFocus(id: string, trigger: HTMLButtonElement): Promise<void> {
		const nextDraft = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('.draft-list__title');
		await controller.deleteDraft(id);
		deleteId = undefined;
		await tick();
		if (nextDraft?.isConnected) {
			nextDraft.focus();
		} else {
			menuTrigger.focus();
		}
	}
</script>

<!-- The name and the date are one line whether or not the row is pressable, so
     the confirm step can take the press away without moving anything. -->
{#snippet identity(draft: DraftSummary)}
	<span class="list-row__name">{draft.title}</span>
	<time datetime={draft.updatedAt} title={fullDraftDate(draft.updatedAt)}>
		{formatDraftDate(draft.updatedAt)}
	</time>
{/snippet}

<details class="draft-menu" bind:open {@attach dismissOnOutside(dismiss)}>
	<!-- The .button flex styling strips the summary's implicit disclosure role in
	     Chromium, so restate the button semantics and expansion state explicitly.
	     Svelte considers the role redundant, but real browsers expose the styled
	     summary as generic without it. -->
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<!-- A chevron, not a hamburger, and it hangs off the draft's own name rather
	     than off the far end of the command strip: the field says which draft this
	     is, and the disclosure beside it says which others there are. Icon only —
	     the name lives in the accessible name and the native tooltip. -->
	<summary
		class="button--quiet icon-button draft-menu__trigger"
		role="button"
		aria-label="Drafts"
		title="Drafts"
		aria-expanded={open}
		bind:this={menuTrigger}
	>
		<svg
			class="draft-menu__chevron"
			aria-hidden="true"
			viewBox="0 0 16 16"
			width="13"
			height="13"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="m4 6.3 4 3.9 4-3.9" />
		</svg>
	</summary>
	<div class="draft-menu__popover">
		<h2 class="draft-menu__heading">Saved drafts</h2>

		{#if controller.drafts.length === 0}
			<p class="empty-state">
				No saved drafts yet. This draft will appear after its first local save.
			</p>
		{:else}
			<ul class="draft-list">
				{#each controller.drafts as draft (draft.id)}
					<li class="list-row" class:current={draft.id === controller.draftId}>
						{#if renameId === draft.id}
							<form class="list-row__form" onsubmit={(event) => submitRename(event, draft.id)}>
								<label class="sr-only" for={`rename-${draft.id}`}>Draft title</label>
								<input
									id={`rename-${draft.id}`}
									bind:value={renameValue}
									{@attach focusRenameField}
								/>
								<button class="button button--contrast" type="submit">Save</button>
								<button
									class="button button--quiet"
									type="button"
									onclick={() => (renameId = undefined)}
								>
									Cancel
								</button>
							</form>
						{:else if deleteId === draft.id}
							<!-- The row stops being a way into the draft while its deletion is
							     the question: one decision on screen, and the confirm sits in
							     the slot the trigger just vacated. -->
							<span class="draft-list__title draft-list__title--static">
								{@render identity(draft)}
							</span>
							<div class="list-row__commands">
								<RemoveButton
									subject={draft.title}
									pending
									onRequest={() => (deleteId = draft.id)}
									onCancel={() => (deleteId = undefined)}
									onConfirm={(trigger) => deleteDraftAndMoveFocus(draft.id, trigger)}
								/>
							</div>
						{:else}
							<button
								type="button"
								class="draft-list__title"
								aria-current={draft.id === controller.draftId ? 'page' : undefined}
								onclick={() => closeAnd(() => controller.openDraft(draft.id))}
							>
								{@render identity(draft)}
							</button>
							<!-- Icons, not four words per row: the labels repeated down the
							     list were the list, and the draft's own name had to compete
							     with them. Each one keeps the draft in its accessible name so
							     "Rename" alone is never all a screen reader hears. -->
							<div class="list-row__commands">
								<button
									type="button"
									class="button--quiet icon-button"
									aria-label="Rename {draft.title}"
									title="Rename"
									onclick={() => beginRename(draft.id, draft.title)}
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 16 16"
										width="14"
										height="14"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="m10.6 2.9 2.5 2.5-7.4 7.4-3.1.6.6-3.1 7.4-7.4Z" />
										<path d="m9.1 4.4 2.5 2.5" />
									</svg>
								</button>
								<button
									type="button"
									class="button--quiet icon-button"
									aria-label="Duplicate {draft.title}"
									title="Duplicate"
									onclick={() => controller.duplicateDraft(draft.id)}
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 16 16"
										width="14"
										height="14"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
										<path
											d="M10.5 3.5v-.8a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h.8"
										/>
									</svg>
								</button>
								<button
									type="button"
									class="button--quiet icon-button"
									aria-label="Export {draft.title}"
									title="Export (.txt)"
									onclick={() => controller.exportDraft(draft.id)}
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 16 16"
										width="14"
										height="14"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M8 2.5v7.2M5.2 7 8 9.8 10.8 7" />
										<path d="M2.9 12.6h10.2" />
									</svg>
								</button>
								<RemoveButton
									subject={draft.title}
									pending={false}
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

		<!-- Same two-press shape as a row's delete, one scope up: the trigger keeps
		     its slot and says what the second press does. -->
		<div class="draft-menu__footer">
			<span class="sr-only" aria-live="polite">
				{confirmDeleteAll ? 'Delete every local draft? Confirm or cancel.' : ''}
			</span>
			{#if confirmDeleteAll}
				<button
					type="button"
					class="button button--danger"
					onclick={async () => {
						await controller.deleteAllDrafts();
						confirmDeleteAll = false;
					}}>Delete all drafts</button
				>
				<button
					type="button"
					class="button button--quiet"
					onclick={() => (confirmDeleteAll = false)}>Cancel</button
				>
			{:else}
				<button
					type="button"
					class="button button--quiet danger-text"
					onclick={() => {
						deleteId = undefined;
						confirmDeleteAll = true;
					}}>Delete all local data…</button
				>
			{/if}
		</div>
	</div>
</details>
