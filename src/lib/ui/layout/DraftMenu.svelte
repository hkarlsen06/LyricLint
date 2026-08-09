<script lang="ts">
	import { ChevronDown, Copy, Download, Pencil } from 'lucide-svelte';
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
	let menuTrigger: HTMLElement;
	let importInput: HTMLInputElement;
	let importing = $state(false);

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
	// present a primed delete the user has already walked away from.
	function dismiss(): void {
		if (!open) {
			return;
		}
		open = false;
		renameId = undefined;
		deleteId = undefined;
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

	async function importScribe(file: File | undefined): Promise<void> {
		if (!file || importing) return;
		importing = true;
		try {
			if (await controller.importScribe(file)) open = false;
		} finally {
			importing = false;
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
		aria-label="'Scribes"
		title="'Scribes"
		aria-expanded={open}
		bind:this={menuTrigger}
	>
		<ChevronDown class="draft-menu__chevron" aria-hidden="true" size={13} strokeWidth={2.25} />
	</summary>
	<div class="draft-menu__popover">
		<div class="draft-menu__titlebar">
			<h2 class="draft-menu__heading">Saved 'scribes</h2>
			<button type="button" class="button" disabled={importing} onclick={() => importInput.click()}>
				{importing ? 'Importing…' : 'Import Scribe…'}
			</button>
		</div>
		<input
			bind:this={importInput}
			hidden
			type="file"
			accept="application/vnd.lyriclint.scribe+json,.lls"
			onchange={(event) => {
				const input = event.currentTarget;
				void importScribe(input.files?.[0]);
				input.value = '';
			}}
		/>

		{#if controller.drafts.length === 0}
			<p class="empty-state">
				No saved 'scribes yet. This one will appear after its first local save.
			</p>
		{:else}
			<ul class="draft-list">
				{#each controller.drafts as draft (draft.id)}
					<li class="list-row" class:current={draft.id === controller.draftId}>
						{#if renameId === draft.id}
							<form class="list-row__form" onsubmit={(event) => submitRename(event, draft.id)}>
								<label class="sr-only" for={`rename-${draft.id}`}>'Scribe title</label>
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

		<!-- No `Delete all local data…` here. It was a footer under this list, and on
		     a fresh install it was the whole menu: a sentence saying there are no
		     'scribes yet, and a red button offering to delete them. The one thing a
		     first-timer opening this out of curiosity met was the most destructive
		     command in the application, pointed at nothing. It lives under `Local
		     data` in the tools panel, where the paragraph above it says what local
		     data is — a claim is made once, where the reader is deciding. -->
	</div>
</details>
