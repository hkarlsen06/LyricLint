<script lang="ts">
	import InlineDiffText from '../primitives/InlineDiffText.svelte';
	import { onMount } from 'svelte';
	import { diffDocuments, type DiffRow } from '$lib/core/document-diff.js';
	import { formatDraftDate } from '../drafts/draft-date.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller, close }: { controller: WorkbenchController; close: () => void } = $props();
	let pasteArea = $state<HTMLTextAreaElement>();
	let pasted = $state('');
	/** The paste step is showing over a baseline that already exists. */
	let replacing = $state(false);

	const baseline = $derived(controller.compareBaseline);
	const asking = $derived(baseline === undefined || replacing);
	const diff = $derived(
		baseline !== undefined ? diffDocuments(baseline.text, controller.snapshot.text) : undefined
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

	onMount(() => {
		pasteArea?.focus();
	});

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
		close();
		// A closing modal restores focus to its trigger — synchronously on some
		// engines, a task later on WebKit — so editor focus taken in the same
		// tick is either trampled or lands while the page is still leaving the
		// dialog's inert state. Either way CodeMirror's cursor layer goes on
		// drawing an unfocused view: a caret that types but cannot be seen. One
		// frame later the restoration has already happened, and the editor's
		// focus is the final word.
		requestAnimationFrame(() => {
			controller.editor.setSelection({ anchor: at, head: at });
			controller.editor.revealRange({ from: at, to: at });
			controller.editor.focus();
		});
	}

	/** The character position under a point, on whichever API this engine has. */
	function caretFromPoint(x: number, y: number): { node: Node; offset: number } | undefined {
		// SAFETY: the widening only adds two optional members, and each is called
		// through its own presence check below — nothing here claims a capability
		// this engine was not asked about first.
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
						     removed rows near the document's end legitimately collapse to
						     the same offset and line label — a key built from those
						     crashed the render as a duplicate. -->
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
								<span class="compare-diff__num">{row.kind === 'removed' ? '' : row.line}</span>
								<span class="compare-diff__text">
									{#if row.kind === 'removed'}
										<InlineDiffText kind="del" text={row.text} blankLabel />
									{:else if row.kind === 'added'}
										<InlineDiffText
											kind="ins"
											text={row.text}
											documentLength={row.text.length}
											blankLabel
											underlineInsertion={false}
										/>
									{:else if row.kind === 'context'}
										<InlineDiffText text={row.text} documentLength={row.text.length} blankLabel />
									{:else}
										{#each row.segments as segment, segmentIndex (segmentIndex)}{#if segment.kind === 'shared'}<InlineDiffText
													kind="shared"
													text={segment.text}
													documentLength={segment.text.length}
												/>{:else}{#if segment.deleted}<InlineDiffText
														kind="del"
														text={segment.deleted}
														documentLength={0}
													/>{/if}{#if segment.inserted}<InlineDiffText
														kind="ins"
														text={segment.inserted}
														documentLength={segment.inserted.length}
														underlineInsertion={false}
													/>{/if}{/if}{/each}
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

<style>
	/* The ask is prose and a paste area directly on the dialog — the dialog is
	   already the surface, so nothing in it is boxed. */
	.compare-dialog__ask {
		display: flex;
		flex-direction: column;
		padding: var(--space-3) var(--space-5) var(--space-5);
		gap: var(--space-3);
	}

	.compare-dialog__ask p {
		margin: 0;
		color: var(--color-text-muted);
	}

	.compare-dialog__ask textarea {
		min-height: 12rem;
		padding: var(--space-2-5);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		background: var(--color-control);
		color: var(--color-text);
		/* Lyric text, so the lyric face — matching the editor the lines came from. */
		font-family: var(--font-lyrics);
		font-size-adjust: var(--font-lyrics-size-adjust);
		font-size: var(--font-size-md);
		line-height: var(--line-height-editor);
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
		padding: var(--space-3) var(--space-5);
		flex-wrap: wrap;
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

	/* Space separates the independent changes without ruling the lyric text. */
	.compare-diff__hunk + .compare-diff__hunk {
		margin-top: var(--space-3);
		padding-top: var(--space-2);
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
		/* Lyric text, so the lyric face — matching the editor the lines came from. */
		font-family: var(--font-lyrics);
		font-size-adjust: var(--font-lyrics-size-adjust);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-editor);
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

	.compare-diff__notes {
		display: block;
		margin-top: var(--space-0-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
</style>
