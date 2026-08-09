<script lang="ts">
	import { tick } from 'svelte';
	import { diffDocuments, type DiffHunk } from '$lib/core/document-diff.js';
	import { compareBaseline, setCompareBaseline } from '../state/compare-baseline.svelte.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	let dialog: HTMLDialogElement;
	let trigger = $state<HTMLButtonElement>();
	let pasteArea = $state<HTMLTextAreaElement>();
	let pasted = $state('');
	/** The paste step is showing over a baseline that already exists. */
	let replacing = $state(false);
	/**
	 * The dialog's contents render only while it is up: the diff re-derives from
	 * every snapshot, and a closed dialog re-diffing the document on each
	 * keystroke would be work nobody is looking at.
	 */
	let isOpen = $state(false);

	const baseline = $derived(compareBaseline(controller.draftId));
	const asking = $derived(baseline === undefined || replacing);
	const diff = $derived(
		isOpen && baseline !== undefined ? diffDocuments(baseline, controller.snapshot.text) : undefined
	);

	const summary = $derived.by(() => {
		if (!diff || diff.identical) return '';
		const parts: string[] = [];
		if (diff.changedLines > 0) {
			parts.push(`${diff.changedLines} ${diff.changedLines === 1 ? 'line' : 'lines'} changed`);
		}
		if (diff.addedLines > 0) parts.push(`${diff.addedLines} added`);
		if (diff.removedLines > 0) parts.push(`${diff.removedLines} removed`);
		return parts.join(' · ');
	});

	async function open(): Promise<void> {
		pasted = '';
		replacing = false;
		isOpen = true;
		dialog.showModal();
		await tick();
		pasteArea?.focus();
	}

	function close(): void {
		dialog.close();
		trigger?.focus();
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === dialog) close();
	}

	/**
	 * A paste from another editor arrives with that editor's line endings, and
	 * usually with the trailing newline a select-all drags along — neither is a
	 * difference anybody made, so neither may reach the diff.
	 */
	function adoptBaseline(): void {
		const normalized = pasted.replace(/\r\n?/g, '\n').replace(/\n$/, '');
		setCompareBaseline(controller.draftId, normalized);
		pasted = '';
		replacing = false;
	}

	function cancelReplacing(): void {
		pasted = '';
		replacing = false;
	}

	/**
	 * The press that makes the modal a review rather than a report: the hunk
	 * closes the surface and puts the editor's selection — and with it the wash —
	 * on its own range. The editor is deliberately left unfocused, exactly as it
	 * is after a diagnostic card's press: a wash with no caret reads as a
	 * location, and a caret the user did not place would arm their next
	 * keystroke over it.
	 */
	function revealHunk(hunk: DiffHunk): void {
		dialog.close();
		controller.editor.setSelection({ anchor: hunk.from, head: hunk.to });
		controller.editor.revealRange({ from: hunk.from, to: hunk.to });
	}
</script>

{#snippet lineText(text: string)}
	{#if text === ''}<em class="compare-diff__blank">(blank line)</em>{:else}{text}{/if}
{/snippet}

<!-- Comparing acts on the whole document, so the trigger lives in the command
     strip — and it does not draw over an empty document, where there is nothing
     to compare and the modal could only explain its own absence. -->
{#if !controller.isEmpty}
	<button
		bind:this={trigger}
		type="button"
		class="button compare-trigger"
		aria-haspopup="dialog"
		onclick={open}
	>
		<!-- Lucide's “diff” glyph (ISC-licensed), geometry unmodified; rendered at
		     15px from its own 24 grid, the stroke width alone raised so its drawn
		     weight matches the 1.4 the strip's other glyphs carry. -->
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="15"
			height="15"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M12 3v14" />
			<path d="M5 10h14" />
			<path d="M5 21h14" />
		</svg>
		Compare
	</button>
{/if}

<dialog
	bind:this={dialog}
	class="compare-dialog"
	aria-labelledby="compare-dialog-title"
	onclick={handleBackdropClick}
	onclose={() => (isOpen = false)}
>
	{#if isOpen}
		<div class="compare-dialog__surface">
			<div class="compare-dialog__header">
				<strong id="compare-dialog-title">Compare with the page</strong>
				<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					>
						<path d="m4 4 8 8M12 4l-8 8" />
					</svg>
				</button>
			</div>

			{#if asking}
				<!-- The ask is what makes the comparison unambiguous: a paste into the
				     editor is working text, a paste here is the page's version, and no
				     heuristic has to tell the two apart. Asked at review time, the
				     baseline is also current by construction — the clipboard was just
				     loaded from the page about to be updated. -->
				<div class="compare-dialog__ask">
					<p>
						Paste the lyrics exactly as the Genius page has them right now. Your 'scribe is compared
						against that, so you can check every change before updating the page.
					</p>
					<textarea
						bind:this={pasteArea}
						bind:value={pasted}
						aria-label="The lyrics as the page has them"
						placeholder="Paste the page's lyrics here"
						spellcheck="false"></textarea>
					<div class="compare-dialog__ask-actions">
						<button
							type="button"
							class="button button--contrast"
							disabled={pasted.trim().length === 0}
							onclick={adoptBaseline}
						>
							Show changes
						</button>
						{#if replacing}
							<button type="button" class="button" onclick={cancelReplacing}>Cancel</button>
						{/if}
					</div>
				</div>
			{:else if diff}
				{#if diff.identical}
					<div class="compare-dialog__ask">
						<p>Your 'scribe matches the page exactly — there is nothing to update on Genius.</p>
						<div class="compare-dialog__ask-actions">
							<button type="button" class="button" onclick={() => (replacing = true)}>
								Change baseline
							</button>
						</div>
					</div>
				{:else}
					<!-- The strip carries something at both ends: the count the list
					     adds up to, and the one control that acts on the whole
					     comparison. The press hint rides the count, because a row that
					     is only pressable is a control nobody discovers. -->
					<div class="compare-dialog__meta">
						<p>{summary} — press a change to jump to it in your 'scribe.</p>
						<button type="button" class="button" onclick={() => (replacing = true)}>
							Change baseline
						</button>
					</div>
					<ul class="compare-diff" aria-label="Changes against the page">
						{#each diff.hunks as hunk (hunk.from + ':' + hunk.line)}
							<li>
								<button type="button" class="compare-diff__hunk" onclick={() => revealHunk(hunk)}>
									<span class="compare-diff__line">Line {hunk.line}</span>
									{#each hunk.rows as row, rowIndex (rowIndex)}
										{#if row.kind === 'removed'}
											<span class="compare-diff__row"
												><del class="compare-diff__drop">{@render lineText(row.text)}</del></span
											>
										{:else if row.kind === 'added'}
											<span class="compare-diff__row"
												><ins class="compare-diff__add">{@render lineText(row.text)}</ins></span
											>
										{:else}
											<span class="compare-diff__row"
												>{#each row.segments as segment, segmentIndex (segmentIndex)}{#if segment.kind === 'shared'}<span
															class="compare-diff__shared">{segment.text}</span
														>{:else}{#if segment.deleted}<del class="compare-diff__drop"
																>{segment.deleted}</del
															>{/if}{#if segment.inserted}<ins class="compare-diff__add"
																>{segment.inserted}</ins
															>{/if}{/if}{/each}</span
											>
										{/if}
									{/each}
									{#if hunk.notes.length > 0}
										<span class="compare-diff__notes">{hunk.notes.join(' · ')}</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	{/if}
</dialog>

<style>
	.compare-trigger {
		white-space: nowrap;
	}

	.compare-trigger svg {
		flex: none;
		color: var(--color-text-muted);
	}

	.compare-dialog {
		width: min(46rem, calc(100vw - var(--space-4)));
		max-width: none;
		max-height: calc(100dvh - var(--space-6));
		padding: 0;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.compare-dialog::backdrop {
		background: var(--color-backdrop);
	}

	.compare-dialog__surface {
		display: grid;
		max-height: calc(100dvh - var(--space-6));
		grid-template-rows: auto auto minmax(0, 1fr);
	}

	.compare-dialog__header {
		display: flex;
		min-height: 3.25rem;
		padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
		border-bottom: var(--border-width) solid var(--color-border);
		align-items: center;
		justify-content: space-between;
	}

	.compare-dialog__header strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
	}

	/* The ask is prose and a paste area directly on the dialog — the dialog is
	   already the surface, so nothing in it is boxed. */
	.compare-dialog__ask {
		display: flex;
		flex-direction: column;
		padding: var(--space-4);
		gap: var(--space-3);
	}

	.compare-dialog__ask p {
		margin: 0;
		color: var(--color-text-muted);
	}

	.compare-dialog__ask textarea {
		min-height: 12rem;
		padding: var(--space-2-5);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-control);
		background: var(--color-control);
		color: var(--color-text);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-normal);
		resize: vertical;
	}

	.compare-dialog__ask textarea:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.compare-dialog__ask-actions {
		display: flex;
		gap: var(--space-2);
	}

	.compare-dialog__meta {
		display: flex;
		padding: var(--space-3) var(--space-4);
		border-bottom: var(--border-width) solid var(--color-border);
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
	}

	.compare-dialog__meta p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.compare-diff {
		margin: 0;
		padding: var(--space-2);
		overflow-y: auto;
		list-style: none;
	}

	/* The hunk is the control all the way down, so the whole card is one button:
	   its rows are display-block spans, which phrasing content allows and a
	   nested block element would not. */
	.compare-diff__hunk {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-2-5);
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--color-text);
		text-align: start;
	}

	.compare-diff__hunk:hover,
	.compare-diff__hunk:focus-visible {
		background: var(--color-control-hover);
	}

	.compare-diff__line {
		display: block;
		margin-bottom: var(--space-0-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}

	/* Spacing differences have to occupy their own width, so every row keeps its
	   whitespace; the invisible ones are what the notes line is for. */
	.compare-diff__row {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-normal);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.compare-diff__shared {
		color: var(--color-text-muted);
	}

	/* The editor's fix-preview idiom: what the page loses stays put, struck
	   through as well as coloured — colour alone is never a state carrier. */
	.compare-diff__drop {
		padding: 0 0.15em;
		border-radius: var(--radius-sm);
		background: var(--color-danger-surface);
		color: var(--color-danger);
		text-decoration: line-through;
	}

	.compare-diff__add {
		padding: 0 0.15em;
		border-radius: var(--radius-sm);
		background: var(--color-success-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.compare-diff__drop + .compare-diff__add {
		margin-inline-start: 0.2em;
	}

	.compare-diff__blank {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.compare-diff__notes {
		display: block;
		margin-top: var(--space-0-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
</style>
