<script lang="ts">
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import { renderProfile } from '#lib/conversion/index.js';
	import { sectionTypeLabel, sectionTypeOptions } from '#lib/conversion/section-types.js';
	import { stanzaOutline, taggedSections, type StanzaRow } from '#lib/conversion/stanzas.js';
	import { Select, type SelectOption } from '../primitives/select/index.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller, active = true }: { controller: WorkbenchController; active?: boolean } =
		$props();

	const NO_TAG = 'none';
	type Choice = (typeof sectionTypeOptions)[number]['value'] | typeof NO_TAG;

	interface OutlineRow {
		from: number;
		line: number;
		/** What the row is called: its tag in a headerless draft, its header in Genius. */
		title?: string;
		opening: string;
		stanza?: StanzaRow;
	}

	const musixmatch = $derived(controller.profile === 'musixmatch');
	const enabled = $derived(
		!controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery
	);
	let lastRows: OutlineRow[] = [];
	// A hidden panel keeps its last outline rather than re-reading every keystroke.
	const rows = $derived.by(() => {
		if (!active) return lastRows;
		const snapshot = controller.snapshot;
		if (musixmatch) {
			const conversion = snapshot.conversion;
			const projection = conversion && renderProfile(conversion.model, conversion.profile);
			const sections =
				conversion && projection?.ok ? taggedSections(conversion.model, projection.value) : [];
			lastRows = stanzaOutline(snapshot.text, sections).map((stanza) => ({
				from: stanza.from,
				line: stanza.line,
				title: stanza.section
					? stanza.section.type
						? sectionTypeLabel(stanza.section.type)
						: stanza.section.name
					: undefined,
				opening: stanza.opening,
				stanza
			}));
		} else {
			lastRows = snapshot.parsed.sections.flatMap((section) => {
				const first = section.lines[0];
				const from = section.header?.from ?? first?.from;
				if (from === undefined) return [];
				return [
					{
						from,
						line: snapshot.text.slice(0, from).split('\n').length,
						title: section.header?.rawNamePart.trim() || undefined,
						opening: first ? snapshot.text.slice(first.from, first.to) : ''
					}
				];
			});
		}
		return lastRows;
	});
	const caret = $derived(controller.snapshot.selection.head);
	const currentFrom = $derived(rows.findLast((row) => row.from <= caret)?.from);
	const taggedCount = $derived(rows.filter((row) => row.stanza?.section).length);

	function options(stanza: StanzaRow): SelectOption<Choice>[] {
		const tags: SelectOption<Choice>[] = [...sectionTypeOptions];
		if (stanza.section?.removable)
			tags.push({
				value: NO_TAG,
				label: 'No tag',
				detail: stanza.continues
					? `Joins the ${stanza.continues.type ? sectionTypeLabel(stanza.continues.type) : stanza.continues.name} above`
					: undefined
			});
		return tags;
	}

	function tag(stanza: StanzaRow, choice: Choice): void {
		const section = stanza.section;
		if (choice === NO_TAG) {
			if (section)
				controller.applyConversionAction({ kind: 'removeSection', sectionId: section.id });
		} else if (section)
			controller.applyConversionAction({
				kind: 'setSectionType',
				sectionId: section.id,
				type: choice
			});
		else controller.applyConversionAction({ kind: 'insertSection', at: stanza.from, type: choice });
	}
</script>

<!--
	The song's shape, first in the tab that is named for the song. In a
	Musixmatch draft the tags live outside the text, so this list is where every
	stanza's tag can be read and set without moving the caret; in a Genius draft
	the headers are text, and the list is a way to move between them.
-->
{#if rows.length > 0}
	<section class="section-outline" aria-labelledby="section-outline-title">
		<h2 id="section-outline-title">Sections</h2>
		{#if musixmatch}
			<p>
				{taggedCount === rows.length
					? `All ${rows.length} stanzas tagged.`
					: `${taggedCount} of ${rows.length} stanzas tagged.`} Tags stay in this draft; apply them in
				Musixmatch when you submit.
			</p>
		{/if}
		<ol>
			{#each rows as row (row.from)}
				{@const stanza = row.stanza}
				<li aria-current={row.from === currentFrom ? 'true' : undefined}>
					{#if stanza}
						<Select
							class="section-outline__tag"
							label={`Tag for the stanza on line ${row.line}`}
							labelHidden
							placeholder="Add tag"
							value={stanza.section?.type ?? ''}
							options={options(stanza)}
							disabled={!enabled}
							onchange={(choice) => tag(stanza, choice)}
						/>
					{/if}
					<button
						type="button"
						class="section-outline__line"
						onclick={() =>
							controller.showConversionPassage({ from: row.from, to: row.from }, 'edit')}
					>
						{#if !stanza}<span class="section-outline__title">{row.title ?? 'No header'}</span
							>{:else if stanza.section && !stanza.section.type}<span class="section-outline__title"
								>{stanza.section.name}</span
							>{/if}
						<span class="section-outline__opening">{row.opening || 'No lyrics yet'}</span>
						<span class="sr-only">, line {row.line}</span>
					</button>
					{#if stanza?.section}
						<button
							type="button"
							class="icon-button section-outline__options"
							data-section-id={stanza.section.id}
							aria-label={`${row.title} section options, line ${row.line}`}
							onclick={() => controller.openSectionDetails(stanza.section!.id)}
							><DotsThreeIcon size="1.125em" weight="bold" aria-hidden="true" /></button
						>
					{:else if stanza?.suggestion}
						{@const suggestion = stanza.suggestion}
						<button
							type="button"
							class="button button--quiet section-outline__suggestion"
							disabled={!enabled}
							aria-label={`Tag the stanza on line ${row.line} as ${sectionTypeLabel(suggestion)}, like its repeat`}
							onclick={() => tag(stanza, suggestion)}>{sectionTypeLabel(suggestion)}?</button
						>
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{/if}

<style>
	ol {
		display: grid;
		margin: 0;
		padding: 0;
		gap: var(--space-0-5);
		list-style: none;
	}

	/* One row per stanza: its tag, its first line, and what else can be done
	   to it. The tag column is fixed so the lines start on one edge. */
	li {
		display: grid;
		min-width: 0;
		padding-inline-start: var(--space-2);
		border-inline-start: calc(2 * var(--border-width)) solid transparent;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-2);
		align-items: center;
	}

	/* The stanza the caret is in: a rail and heavier ink, never color alone. */
	li[aria-current] {
		border-inline-start-color: var(--color-accent);
	}

	li[aria-current] .section-outline__opening {
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
	}

	/* Wide enough for `Pre-Chorus`, the longest tag, at the size it is set in. */
	li :global(.section-outline__tag) {
		width: 7rem;
	}

	li :global(.section-outline__tag .ui-select__trigger) {
		font-size: var(--font-size-sm);
	}

	.section-outline__line {
		display: grid;
		min-width: 0;
		min-height: var(--control-height-lg);
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-control);
		gap: var(--space-0-5);
		background: transparent;
		color: inherit;
		text-align: start;
	}

	.section-outline__line:hover {
		background: var(--color-fill-subtle);
	}

	.section-outline__title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	.section-outline__opening {
		overflow: hidden;
		color: var(--color-text-muted);
		font-family: var(--font-lyrics);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.section-outline__options {
		color: var(--color-text-muted);
	}

	.section-outline__suggestion {
		white-space: nowrap;
	}

	@media (pointer: coarse) {
		.section-outline__line {
			min-height: var(--control-height-touch);
		}

		/* A phone's row is too narrow for a tag beside its line: the line takes
		   the row and the tag sits under it. */
		li {
			padding-block: var(--space-1);
			row-gap: 0;
		}

		.section-outline__line {
			grid-column: 1 / -1;
			grid-row: 1;
			padding-inline: 0;
		}

		li :global(.section-outline__tag) {
			width: 8.75rem;
		}

		li :global(.section-outline__tag .ui-select__trigger) {
			font-size: var(--font-size-editor);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.section-outline__line,
		li {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart);
		}
	}
</style>
