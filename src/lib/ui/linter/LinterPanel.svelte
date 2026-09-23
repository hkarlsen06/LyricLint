<script lang="ts">
	import { lineNumberLookup } from '$lib/core/line-numbers.js';
	import type { Diagnostic, Severity } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';
	import DiagnosticList from './DiagnosticList.svelte';
	import SeverityIcon from '$lib/diagnostics/SeverityIcon.svelte';
	import { severityPluralLabels } from '$lib/diagnostics/severity-labels.js';
	import { tick } from 'svelte';

	let {
		controller,
		nativeRulesStatus = 'ready',
		onRetryNativeRules,
		active = true,
		mobile = false,
		reviewFocused = false,
		onOpenFinding,
		onReviewList
	}: {
		controller: WorkbenchController;
		nativeRulesStatus?: 'pending' | 'failed' | 'ready';
		onRetryNativeRules?: () => void;
		active?: boolean;
		mobile?: boolean;
		reviewFocused?: boolean;
		onOpenFinding?: (diagnostic: Diagnostic) => void;
		onReviewList?: () => void;
	} = $props();

	async function retryChecking(trigger: HTMLButtonElement): Promise<void> {
		const ownedFocus = document.activeElement === trigger;
		const reviewTab = trigger
			.closest('.right-panel')
			?.querySelector<HTMLButtonElement>('#linter-panel-tab');
		onRetryNativeRules?.();
		await tick();
		if (ownedFocus && !trigger.isConnected) reviewTab?.focus();
	}

	// One row at a time may be armed for deletion, so the pending draft is the
	// list's state rather than each row's.
	let pendingDeleteId = $state<string | undefined>();

	async function deleteRecentDraft(id: string, trigger: HTMLButtonElement): Promise<void> {
		// The row is about to leave the list, so the press hands focus to the next
		// draft in it before it goes.
		const nextDraft = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('.linter-panel__recent-draft');
		await controller.deleteDraft(id);
		pendingDeleteId = undefined;
		await tick();
		if (nextDraft?.isConnected) nextDraft.focus();
	}

	const filters: Array<{ value: Severity; label: string }> = [
		{ value: 'error', label: severityPluralLabels.error },
		{ value: 'warning', label: severityPluralLabels.warning },
		{ value: 'suggestion', label: severityPluralLabels.suggestion },
		{ value: 'manual-review', label: severityPluralLabels['manual-review'] }
	];

	const counts = $derived.by(() => {
		const result = {
			error: 0,
			warning: 0,
			suggestion: 0,
			'manual-review': 0
		} satisfies Record<Severity, number>;
		for (const diagnostic of controller.unignoredDiagnostics) {
			result[diagnostic.severity] += 1;
		}
		return result;
	});

	// One chip per kind the document actually has something in. `Errors 0` and
	// `Manual review 0` were two thirds of this row on an ordinary draft: a count
	// that could not have been otherwise, offering to filter out a kind that is
	// not there, which is the same thing the status bar refuses to print.
	//
	// The count is over the unignored diagnostics and blind to the filters, which
	// is what makes this safe: a kind the user has switched off keeps its count,
	// so it keeps its chip, which is the only way back to it. A kind with nothing
	// in it has nothing to show and nothing to hide, so it draws nothing, and a
	// document with no findings draws no row at all.
	const chips = $derived(filters.filter((filter) => counts[filter.value] > 0));

	// Diagnostics the severity chips are currently hiding. Ignored rules do not
	// count: the filters only take the blame for what they actually hide.
	const hiddenByFilters = $derived(
		controller.unignoredDiagnostics.filter(
			(diagnostic) => !controller.severityFilter.includes(diagnostic.severity)
		).length
	);

	// Only blame the filters when they are actually what is hiding something;
	// an otherwise clean draft should read as clean.
	const emptyState = $derived.by(() => {
		// An untouched draft is not "clean": it has nothing to lint yet. The
		// editor now carries the instructions (a ghost transcription where the
		// caret is, and Paste lyrics in the toolbar), so this line says what the
		// panel will do rather than repeating how to feed it, and the space under
		// it holds the two things worth pressing from here.
		if (controller.snapshot.text.length > 0 && nativeRulesStatus !== 'ready') {
			return {
				status: true,
				title: nativeRulesStatus === 'failed' ? 'Checking unavailable' : 'Checking lyrics…',
				detail:
					nativeRulesStatus === 'failed'
						? 'Retry to check this draft.'
						: 'You can keep writing while the checker loads.'
			};
		}
		if (controller.isEmpty) {
			return {
				title: 'Ready for your lyrics',
				detail: 'Suggestions will appear here as you write.',
				waiting: true
			};
		}

		if (hiddenByFilters > 0) {
			return {
				title: 'Hidden by filters',
				detail: `${hiddenByFilters} ${hiddenByFilters === 1 ? 'issue is' : 'issues are'} hidden by the severity filters. Re-enable a severity to see ${hiddenByFilters === 1 ? 'it' : 'them'}.`
			};
		}
		if (controller.snapshot.diagnostics.length > 0) {
			return {
				title: 'All findings set aside',
				detail: 'Your choices are saved with this draft.\nYou can restore any finding below.',
				settled: true
			};
		}
		return {
			title: 'No issues found',
			detail: 'Your lyrics pass every enabled rule.\nChecking continues as you write.',
			clean: true
		};
	});

	// The list ends on purpose, not because the panel ran out of surface: the
	// line after the last card says whether anything else is out of sight.
	const afterword = $derived(
		hiddenByFilters > 0
			? `${hiddenByFilters} more ${hiddenByFilters === 1 ? 'issue' : 'issues'} hidden by the severity filters.`
			: 'No further issues detected.'
	);

	// What pressing the bulk button would settle, and what it would leave behind.
	// Both numbers are about the list directly below, so they are counted over
	// the same visible diagnostics the cards are drawn from.
	const bulk = $derived(controller.bulkFixPlan);

	// A fresh open is only empty because it opened a *new* draft, and the work a
	// returning user came back for is behind the drafts menu, which they have to
	// know to look in. The panel has the room, so it says so.
	const recentDrafts = $derived(
		controller.drafts.filter((draft) => draft.id !== controller.draftId).slice(0, 5)
	);

	async function applyBulkFix(trigger: HTMLButtonElement): Promise<void> {
		const ownedFocus = document.activeElement === trigger;
		const panel = trigger.closest('.linter-panel');
		const reviewTab = trigger
			.closest('.right-panel')
			?.querySelector<HTMLButtonElement>('#linter-panel-tab');
		controller.applyBulkFix();
		await tick();
		if (ownedFocus && !trigger.isConnected) {
			const next =
				panel?.querySelector<HTMLButtonElement>(
					'.diagnostic-card--expanded .diagnostic-list__navigate'
				) ??
				panel?.querySelector<HTMLButtonElement>('.diagnostic-list__navigate') ??
				reviewTab;
			next?.focus();
		}
	}

	const lineFor = $derived(lineNumberLookup(controller.snapshot.text));
</script>

<div class="panel-content linter-panel" class:linter-panel--focused={mobile && reviewFocused}>
	{#if mobile && reviewFocused}
		<button type="button" class="button button--quiet mobile-review-back" onclick={onReviewList}
			>All findings</button
		>
	{/if}
	{#if controller.visibleDiagnostics.length > 0 || hiddenByFilters > 0}
		<h2 class="linter-panel__heading">Review lyrics</h2>
	{/if}
	<!-- The chips are on screen whenever there is something to filter. They used
	     to be revealed by pressing the Linter tab a second time from inside the
	     linter, which is a gesture nobody performs and nothing advertises. It is the
	     same failure the timestamp gutter had when its control only appeared
	     under a hovering pointer, and it is worse here because there was no
	     column to hover: the filters read as a feature the workbench does not
	     have.

	     What paid for the reveal was space, and the row buys it back by drawing
	     only the kinds that are there. It also earns its place at rest: the card
	     dropped the severity *word* in favour of a glyph, so this row is now the
	     one surface in the workbench that pairs the four marks with their names,
	     and it hangs directly above the column it is the legend for. -->
	{#if chips.length > 0}
		<div class="linter-panel__filters" role="group" aria-label="Filter diagnostics by severity">
			{#each chips as filter (filter.value)}
				<button
					type="button"
					class="filter-chip filter-chip--{filter.value}"
					aria-pressed={controller.severityFilter.includes(filter.value)}
					onclick={() => controller.toggleSeverity(filter.value)}
				>
					<!-- The chip wears the mark its rows wear. The row's word is gone, so
					     without this the only thing tying "Suggestions" to the eight rows
					     it hides would be their shared color. -->
					<SeverityIcon severity={filter.value} />
					{filter.label}
					<span class="filter-chip__count">{counts[filter.value]}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- The whole-document command is a strip of chrome under the tab strip, the
	     same material as the severity chips that hang above it. The material is
	     the point, and it took three tries to see why: the panel already spends
	     `--color-canvas` on the *selected* diagnostic, so a row of bare canvas
	     here, which is what this was, is the same tone as the open card below
	     it, and the two merge into one region with a button loose inside it.
	     Chrome is what the panel means by "not the list": tab strip, chips, this,
	     and the ignored-rules footer.

	     Command at one end, what it will not touch at the other. That is also
	     what keeps the row from reading as a lone button in half a row of dead
	     gutter, which is how the first version of this failed. It is absent, not
	     disabled, when there is nothing it could do. -->
	{#if bulk.automatic > 0}
		<div class="linter-panel__bulk">
			<button
				type="button"
				class="button linter-panel__bulk-action"
				onclick={(event) => void applyBulkFix(event.currentTarget)}
			>
				Fix {bulk.automatic}
				{bulk.automatic === 1 ? 'issue' : 'issues'} automatically
			</button>
			<!-- Why the count on the button is smaller than the count on the tab, so
			     the issues still standing afterwards read as the ones that were
			     always going to need the user, not as a fix that half worked. -->
			{#if bulk.manual > 0}
				<span class="linter-panel__bulk-note">{bulk.manual} need a decision</span>
			{/if}
		</div>
	{/if}

	<!-- Only the untouched-document state gets a control, and only the sample:
	     it is the one thing that answers "nothing to lint yet" in place, so it
	     stays with the sentence it answers. "Hidden by filters" and "All issues
	     ignored" already name the chip or the footer that undid them, and "No
	     issues found" is not a problem to solve. The drafts are not an answer to
	     this state at all, they are somewhere else to be, so they wait at the
	     far end of the column instead of between the message and its offer. -->
	{#snippet emptyActions()}
		{#if controller.snapshot.text.length > 0 && nativeRulesStatus === 'failed'}
			<button
				type="button"
				class="button"
				onclick={(event) => void retryChecking(event.currentTarget)}>Retry checking</button
			>
		{/if}
		{#if controller.isEmpty && controller.canLoadSample}
			<div class="linter-panel__empty-action">
				<button type="button" class="button" onclick={() => controller.loadSample()}>
					Load a sample 'scribe
				</button>
			</div>
		{/if}
	{/snippet}

	<DiagnosticList
		overview={mobile && !reviewFocused}
		focusedOnly={mobile && reviewFocused}
		active={active && controller.activeTab === 'linter'}
		diagnostics={controller.visibleDiagnostics}
		rowKey={controller.diagnosticRowKey}
		sources={controller.sources}
		activeDiagnosticKey={controller.activeDiagnosticKey}
		activeDiagnosticRange={controller.activeDiagnosticRange}
		{emptyState}
		{emptyActions}
		{lineFor}
		onNavigate={(diagnostic) => {
			if (mobile) onOpenFinding?.(diagnostic);
			else controller.navigateToDiagnostic(diagnostic, { focus: false });
		}}
		onChooseHeader={(diagnostic) => controller.chooseSectionHeader(diagnostic)}
		canAssignPerformers={(diagnostic) => controller.canAssignDiagnosticPerformers(diagnostic)}
		onAssignPerformers={(diagnostic) => controller.assignDiagnosticPerformers(diagnostic)}
		onLinkSections={(diagnostic) => controller.linkDiagnosticSections(diagnostic)}
		onSetLanguage={(language) => controller.setLanguage(language)}
		onPreviewFix={(diagnostic, fix) => controller.previewFix(diagnostic, fix)}
		onCancelPreview={() => controller.clearFixPreview()}
		onApplyFix={(diagnostic, fix) => controller.applyFix(diagnostic, fix)}
		fixBatchSize={(diagnostic, fix) => controller.fixBatchSize(diagnostic, fix)}
		onApplyFixBatch={(diagnostic, fix) => controller.applyFixBatch(diagnostic, fix)}
		onIgnore={(diagnostic) => controller.ignoreDiagnostic(diagnostic)}
	/>
	{#if controller.visibleDiagnostics.length > 0}
		<p class="linter-panel__afterword">{afterword}</p>
	{/if}

	<!-- The drafts the user already has sit at the foot of the column, under
	     whatever the panel is currently saying about this document. They are a
	     way out of it rather than a thing to do about it, and reading order is
	     the difference: the message, the sample that resolves it, then, after
	     the panel has finished with this draft, the others. Prose on the canvas,
	     no border: the gap above it is already the separation. -->
	{#if controller.isEmpty && recentDrafts.length > 0}
		<div class="linter-panel__drafts">
			<p class="linter-panel__empty-label" id="linter-panel-recent-label">Recent 'scribes</p>
			<ul class="linter-panel__recent" aria-labelledby="linter-panel-recent-label">
				{#each recentDrafts as draft (draft.id)}
					<li>
						<!-- Somewhere to go back to is also somewhere to be done with, and
						     the drafts a returning user wants rid of are exactly the ones
						     listed here. Same two-press control as the drafts menu, in the
						     row it acts on. -->
						{#if pendingDeleteId === draft.id}
							<span class="linter-panel__recent-draft linter-panel__recent-draft--static">
								<span class="linter-panel__recent-title">{draft.title}</span>
								<time datetime={draft.updatedAt} title={fullDraftDate(draft.updatedAt)}>
									{formatDraftDate(draft.updatedAt)}
								</time>
							</span>
						{:else}
							<button
								type="button"
								class="linter-panel__recent-draft"
								onclick={() => controller.openDraft(draft.id)}
							>
								<span class="linter-panel__recent-title">{draft.title}</span>
								<time datetime={draft.updatedAt} title={fullDraftDate(draft.updatedAt)}>
									{formatDraftDate(draft.updatedAt)}
								</time>
							</button>
						{/if}
						<RemoveButton
							subject={draft.title}
							pending={pendingDeleteId === draft.id}
							onRequest={() => (pendingDeleteId = draft.id)}
							onCancel={() => (pendingDeleteId = undefined)}
							onConfirm={(trigger) => deleteRecentDraft(draft.id, trigger)}
						/>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	/* A full-height column keeps recent drafts at the foot. Findings are inset
	   rounded rows, separated by space rather than a ruled grid. */
	.panel-content.linter-panel {
		display: flex;
		padding: 0;
		flex: 1;
		flex-direction: column;
	}

	.linter-panel .linter-panel__heading {
		margin: 0;
		padding: var(--space-5) var(--space-4) var(--space-3);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
	}

	/* The drafts sit at the foot of the column, pushed there by the auto margin
	   rather than by whatever is above them: on an empty document that is a short
	   paragraph, and a list of destinations left directly under it read as part of
	   the message. Still prose on the canvas: a list of the user's own drafts is
	   not a region anyone acts on independently of its neighbours, so there is no
	   border to draw around it, and the empty canvas above is the separation. */
	.linter-panel__drafts {
		padding: var(--space-4) var(--space-3);
		margin-top: auto;
	}

	.linter-panel__empty-label {
		margin: 0 0 var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.linter-panel__recent {
		display: grid;
		padding: 0;
		margin: 0;
		list-style: none;
	}

	/* The row is the draft; the delete rides at its end. Both surfaces that list
	   drafts offer the same way out of one, so neither is the place a user has to
	   remember to go. */
	.linter-panel__recent > li {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	/* A draft is a destination, so it reads as a line of text you can press rather
	   than as a button: full-width target, title first, and the date it was last
	   touched trailing on the same line to tell two similar titles apart. */
	.linter-panel__recent-draft {
		display: flex;
		width: 100%;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) 0;
		border: 0;
		background: none;
		color: var(--color-text);
		font-family: inherit;
		font-size: var(--font-size-sm);
		text-align: start;
		cursor: pointer;
	}

	.linter-panel__recent-draft {
		flex: 1;
		min-width: 0;
	}

	/* While its deletion is the question the row is not also a way into the draft:
	   same line, same columns, one decision. */
	.linter-panel__recent-draft--static {
		cursor: default;
	}

	.linter-panel__recent-draft:hover .linter-panel__recent-title {
		text-decoration: underline;
	}

	.linter-panel__recent-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The delete stays out of the way until the row is: a muted glyph that only
	   colors under the pointer or focus (see RemoveButton.svelte). */
	.linter-panel__recent :global(.remove-button) {
		flex: none;
	}

	.linter-panel__recent-draft:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.linter-panel__recent-draft time {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
	}

	/* The grid stretches its items, and a button that spans the prose measure reads
	   as a banner rather than an offer. */
	.linter-panel__empty-action {
		justify-self: center;
		padding-top: var(--space-3);
	}

	/* The list ends deliberately: a muted line after the last card says whether
	   anything else is hidden, so the canvas below never reads as an accident. */
	.linter-panel__afterword {
		padding: var(--space-3) var(--space-3) var(--space-4);
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	/* Chrome, like the tab strip above and the ignored-rules footer at the far end
	   of the panel: this row is not part of the list it acts on. The fill is load
	   bearing rather than decorative: `--color-canvas` is already spoken for as
	   the *selected* card's recessed level, so a row of bare canvas here read as a
	   continuation of whichever card was open and the button looked loose inside
	   it. Same inset as the chips row, which is the other strip that hangs here. */
	.linter-panel__bulk {
		display: flex;
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border-bottom: 0;
		margin: 0;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
		background: var(--color-chrome);
	}

	/* Compact, and bordered rather than quiet: it has to read as pressable against
	   a strip that is otherwise inert. It keeps the default tier: the contrast
	   action on this surface belongs to the fix a card is previewing, and there is
	   one of those per surface. */
	.linter-panel__bulk-action {
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-2-5);
		font-size: var(--font-size-xs);
	}

	/* The shared size floors for a phone's `.button` (responsive-shared.css) used to
	   outrank the compact height above on specificity. Scoped, this rule ties
	   them, so the floors are restated here rather than left to stylesheet order. */
	@media (max-width: 46rem) {
		:global(:root) .linter-panel__bulk-action {
			min-height: var(--control-height-lg);
		}
	}

	@media (pointer: coarse) {
		:global(:root) .linter-panel__bulk-action {
			min-height: var(--control-height-touch);
		}
	}

	/* Rides the far end of the row, which is the same thing as saying the command
	   does not fill it: a lone button with an empty half-row beside it was the
	   shape this strip started as. */
	.linter-panel__bulk-note {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	/* The chips hang from the tab strip: no gap above them, and a rule below
	   separating them from the run of diagnostic cards. They are drawn whenever the
	   document has a finding of any kind: one chip per kind that is actually
	   there, so the row costs the panel nothing on a clean draft and never offers
	   to filter out a severity with nothing in it. */
	.linter-panel__filters {
		display: flex;
		padding: var(--space-2) var(--space-3);
		border-bottom: 0;
		flex-wrap: wrap;
		gap: var(--space-1);
		/* Chrome, like the tab strip it drops out of: the row is an extension of
		   the tabs, not the first item in the list of diagnostics. */
		background: var(--color-chrome);
	}

	/* The chip itself is `.filter-chip` in `controls.css`, the same control
	   filtering the same kinds out of a list wherever one is drawn, so it is one
	   implementation and not two. Nothing about it needs overriding here; this
	   row only decides where the chips sit. */

	/* The count is what pressing the chip puts back. A kind with nothing in it
	   draws no chip rather than printing a zero. It used to also drop to
	   `opacity: 0.45` (2.2:1), which made the number the hardest thing on the
	   chip to read. */
	.filter-chip__count {
		min-width: 1.1em;
		color: inherit;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	/* Keep this query aligned with PHONE_WORKSPACE_QUERY. An opened finding is
	   the whole task view, so the list's chrome steps aside for it. */
	@media (pointer: coarse) and (max-width: 68rem) {
		.linter-panel--focused > .linter-panel__heading,
		.linter-panel--focused > .linter-panel__filters,
		.linter-panel--focused > .linter-panel__bulk,
		.linter-panel--focused > .linter-panel__afterword {
			display: none;
		}

		.mobile-review-back {
			align-self: flex-start;
		}
	}
</style>
