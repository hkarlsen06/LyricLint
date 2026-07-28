<script lang="ts">
	import type { Severity } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';
	import DiagnosticList from './DiagnosticList.svelte';
	import SeverityIcon from '$lib/diagnostics/SeverityIcon.svelte';
	import { tick } from 'svelte';

	let { controller }: { controller: WorkbenchController } = $props();

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
		{ value: 'error', label: 'Errors' },
		{ value: 'warning', label: 'Warnings' },
		{ value: 'suggestion', label: 'Suggestions' },
		{ value: 'manual-review', label: 'Manual review' }
	];

	const counts = $derived.by(() => {
		const result: Record<Severity, number> = {
			error: 0,
			warning: 0,
			suggestion: 0,
			'manual-review': 0
		};
		for (const diagnostic of controller.unignoredDiagnostics) {
			result[diagnostic.severity] += 1;
		}
		return result;
	});

	// One chip per kind the document actually has something in. `Errors 0` and
	// `Manual review 0` were two thirds of this row on an ordinary draft: a count
	// that could not have been otherwise, offering to filter out a kind that is
	// not there — the same thing the status bar refuses to print.
	//
	// The count is over the unignored diagnostics and blind to the filters, which
	// is what makes this safe: a kind the user has switched off keeps its count,
	// so it keeps its chip, which is the only way back to it. A kind with nothing
	// in it has nothing to show and nothing to hide, so it draws nothing — and a
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
		// An untouched draft is not "clean" — it has nothing to lint yet. The
		// editor now carries the instructions (a ghost transcription where the
		// caret is, and Paste lyrics in the toolbar), so this line says what the
		// panel will do rather than repeating how to feed it, and the space under
		// it holds the two things worth pressing from here.
		if (controller.isEmpty) {
			return {
				title: 'Nothing to lint yet',
				detail: 'Findings appear here as soon as the document has something in it.'
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
				// Not "all issues ignored", which reads as a verdict on the reader. The
				// findings are set aside, not dismissed, and the way back is offered
				// rather than instructed.
				title: 'Nothing left to show',
				detail:
					'Every finding here is set aside for this session. Bring any of them back from Ignored diagnostics below.'
			};
		}
		return {
			title: 'No issues found',
			detail: "This 'scribe passes every enabled rule. Diagnostics reappear as you edit."
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

	// A fresh open is only empty because it opened a *new* draft — the work a
	// returning user came back for is behind the drafts menu, which they have to
	// know to look in. The panel has the room, so it says so.
	const recentDrafts = $derived(
		controller.drafts.filter((draft) => draft.id !== controller.draftId).slice(0, 5)
	);

	function lineFor(offset: number): number {
		const text = controller.snapshot.text;
		let line = 1;
		for (let index = 0; index < offset && index < text.length; index += 1) {
			if (text[index] === '\n') line += 1;
		}
		return line;
	}
</script>

<div class="panel-content linter-panel">
	<!-- The chips are on screen whenever there is something to filter. They used
	     to be revealed by pressing the Linter tab a second time from inside the
	     linter, which is a gesture nobody performs and nothing advertises — the
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
	     here — which is what this was — is the same tone as the open card below
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
				onclick={() => controller.applyBulkFix()}
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
	     this state at all — they are somewhere else to be — so they wait at the
	     far end of the column instead of between the message and its offer. -->
	{#snippet emptyActions()}
		{#if controller.isEmpty && controller.canLoadSample}
			<div class="linter-panel__empty-action">
				<button type="button" class="button" onclick={() => controller.loadSample()}>
					Load a sample 'scribe
				</button>
			</div>
		{/if}
	{/snippet}

	<DiagnosticList
		diagnostics={controller.visibleDiagnostics}
		sources={controller.sources}
		activeDiagnosticKey={controller.activeDiagnosticKey}
		{emptyState}
		{emptyActions}
		{lineFor}
		onNavigate={(diagnostic) => controller.navigateToDiagnostic(diagnostic)}
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
	     the difference: the message, the sample that resolves it, then — after
	     the panel has finished with this draft — the others. Prose on the canvas,
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
