<script lang="ts">
	import { tick } from 'svelte';
	import { diffDocuments, type DiffRow } from '$lib/core/document-diff.js';
	import { formatDraftDate } from '../drafts/draft-date.js';
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

	const baseline = $derived(controller.compareBaseline);
	const asking = $derived(baseline === undefined || replacing);
	const diff = $derived(
		isOpen && baseline !== undefined
			? diffDocuments(baseline.text, controller.snapshot.text)
			: undefined
	);

	/**
	 * The baseline persists with the draft, so a review can run against a page
	 * that has moved on since the paste — the age is therefore stated where the
	 * diff is being trusted, with the repair beside it, rather than warned about
	 * after the copy has already been made.
	 */
	const baselineDate = $derived.by(() => {
		if (baseline === undefined) return '';
		const word = formatDraftDate(baseline.pastedAt);
		return word === 'Today' || word === 'Yesterday' ? word.toLowerCase() : word;
	});
	const baselineStale = $derived(
		baseline !== undefined &&
			new Date(baseline.pastedAt).toDateString() !== new Date().toDateString()
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
		controller.setCompareBaseline(normalized);
		pasted = '';
		replacing = false;
	}

	function cancelReplacing(): void {
		pasted = '';
		replacing = false;
	}

	/**
	 * The press that makes the modal a review rather than a report: every row —
	 * context and header included — closes the surface and parks the caret at
	 * that line in the editor. Unlike a diagnostic card's press, the editor
	 * takes focus: the diagnostic idiom protects a caret the user never placed,
	 * and this caret is exactly where they aimed, on a line they pressed in
	 * order to go and edit.
	 */
	function revealRow(at: number): void {
		dialog.close();
		controller.editor.setSelection({ anchor: at, head: at });
		controller.editor.revealRange({ from: at, to: at });
		controller.editor.focus();
	}

	/** The character position under a point, on whichever API this engine has. */
	function caretFromPoint(x: number, y: number): { node: Node; offset: number } | undefined {
		const doc = document as Document & {
			caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
			caretRangeFromPoint?(x: number, y: number): Range | null;
		};
		// The standard first; caretRangeFromPoint is the WebKit fallback.
		if (doc.caretPositionFromPoint) {
			const position = doc.caretPositionFromPoint(x, y);
			return position ? { node: position.offsetNode, offset: position.offset } : undefined;
		}
		const range = doc.caretRangeFromPoint?.(x, y);
		return range ? { node: range.startContainer, offset: range.startOffset } : undefined;
	}

	type PressableRow = Exclude<DiffRow, { kind: 'gap' }>;

	/**
	 * Where in the document a press landed, to the character where the browser
	 * can say and to the row's own line where it cannot — a keyboard activation
	 * carries no point at all, and a press on the gutter or the padding names
	 * the line rather than a character in it.
	 *
	 * Each rendered piece of a row carries its own document length, so the tap
	 * resolves by summing the pieces before the one under the pointer and
	 * adding the offset inside it. A del run carries zero — its characters are
	 * not in the document, so a tap on one lands at the boundary its deletion
	 * left behind. A removed row has no line at all and always names the point
	 * the removal left.
	 */
	function tapOffset(row: PressableRow, event: MouseEvent): number {
		if (row.kind === 'removed') return row.at;
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return row.at;
		const text = target.querySelector('.compare-diff__text');
		const position = caretFromPoint(event.clientX, event.clientY);
		if (
			!text ||
			!position ||
			position.node.nodeType !== Node.TEXT_NODE ||
			!text.contains(position.node)
		) {
			return row.at;
		}
		let offset = 0;
		for (const piece of text.querySelectorAll<HTMLElement>('[data-doc-len]')) {
			const length = Number(piece.dataset.docLen ?? '0');
			if (piece.contains(position.node)) {
				return row.at + offset + Math.min(position.offset, length);
			}
			offset += length;
		}
		return row.at;
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
						<p class="compare-dialog__age">
							{#if baselineStale}
								Baseline from {baselineDate} — the page may have changed since; replace it to be sure.
							{:else}
								Baseline from {baselineDate}.
							{/if}
						</p>
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
						<div>
							<p>{summary} — press any line to put the caret on it in your 'scribe.</p>
							<p class="compare-dialog__age">
								{#if baselineStale}
									Baseline from {baselineDate} — the page may have changed since; replace it to be sure.
								{:else}
									Baseline from {baselineDate}.
								{/if}
							</p>
						</div>
						<button type="button" class="button" onclick={() => (replacing = true)}>
							Change baseline
						</button>
					</div>
					<ul class="compare-diff" aria-label="Changes against the page">
						<!-- Keyed by position: a hunk has no identity of its own, and two
						     removals straddling a kept line near the document's end
						     legitimately collapse to the same offset and line label — a
						     key built from those crashed the render as a duplicate. -->
						<!-- No "Line N" heading over a hunk: the card starts at the section
						     header, several lines above the change the heading would name,
						     so any one number over the card is wrong for most of its rows.
						     The number rides each row instead, in the editor's own gutter
						     idiom — and a removed line, which has no line in the document
						     any more, honestly draws none. -->
						{#each diff.hunks as hunk, hunkIndex (hunkIndex)}
							<li class="compare-diff__hunk">
								{#each hunk.rows as row, rowIndex (rowIndex)}
									{#if row.kind === 'gap'}
										<!-- Lyrics skipped between the section header and the
										     neighbour; aria-hidden because "some lines omitted"
										     is already what a list of separate rows announces. -->
										<span class="compare-diff__gap" aria-hidden="true"
											><span class="compare-diff__num"></span><span>⋯</span></span
										>
									{:else}
										<button
											type="button"
											class="compare-diff__row"
											class:compare-diff__row--context={row.kind === 'context'}
											onclick={(event) => revealRow(tapOffset(row, event))}
										>
											<span class="compare-diff__num">{row.kind === 'removed' ? '' : row.line}</span
											>
											<span class="compare-diff__text">
												{#if row.kind === 'removed'}
													<del class="compare-diff__drop">{@render lineText(row.text)}</del>
												{:else if row.kind === 'added'}
													<ins class="compare-diff__add" data-doc-len={row.text.length}
														>{@render lineText(row.text)}</ins
													>
												{:else if row.kind === 'context'}
													<span data-doc-len={row.text.length}>{@render lineText(row.text)}</span>
												{:else}
													{#each row.segments as segment, segmentIndex (segmentIndex)}{#if segment.kind === 'shared'}<span
																class="compare-diff__shared"
																data-doc-len={segment.text.length}>{segment.text}</span
															>{:else}{#if segment.deleted}<del
																	class="compare-diff__drop"
																	data-doc-len="0">{segment.deleted}</del
																>{/if}{#if segment.inserted}<ins
																	class="compare-diff__add"
																	data-doc-len={segment.inserted.length}>{segment.inserted}</ins
																>{/if}{/if}{/each}
												{/if}
											</span>
										</button>
									{/if}
								{/each}
								{#if hunk.notes.length > 0}
									<span class="compare-diff__notes">{hunk.notes.join(' · ')}</span>
								{/if}
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

	/* The baseline's age is a fact about the comparison, in the meta idiom:
	   muted, small, under the count it qualifies. The staleness nudge stays in
	   the sentence rather than becoming a tinted box — a warning reads as prose
	   in the section it belongs to. */
	.compare-dialog__age {
		margin: var(--space-0-5) 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.compare-diff {
		margin: 0;
		padding: var(--space-2);
		overflow-y: auto;
		list-style: none;
	}

	.compare-diff__hunk {
		display: block;
		padding: var(--space-2) var(--space-2-5);
	}

	/* One run of hunks, hairlines where they meet — not a heading over each. */
	.compare-diff__hunk + .compare-diff__hunk {
		margin-top: var(--space-1);
		padding-top: var(--space-2);
		border-top: var(--border-width) solid var(--color-border);
	}

	/* Every line is its own press, so every line is its own button — the row
	   that lights up is exactly the line the caret will land on. Spacing
	   differences have to occupy their own width, so every row keeps its
	   whitespace; the invisible ones are what the notes line is for. */
	.compare-diff__row,
	.compare-diff__gap {
		display: flex;
		width: 100%;
		padding: 0 var(--space-1);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-normal);
		gap: var(--space-2);
		text-align: start;
	}

	.compare-diff__row:hover,
	.compare-diff__row:focus-visible {
		background: var(--color-control-hover);
	}

	/* The row's own line number, in the editor's gutter idiom. A removed line
	   has no line in the document any more, so its cell is honestly empty. */
	.compare-diff__num {
		flex: none;
		min-width: 3ch;
		color: var(--color-text-disabled);
		text-align: end;
	}

	.compare-diff__text {
		min-width: 0;
		flex: 1;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* Orientation, not change: the header and the neighbours read as the quiet
	   surroundings the marked lines sit in. */
	.compare-diff__row--context {
		color: var(--color-text-muted);
	}

	.compare-diff__gap {
		color: var(--color-text-muted);
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
