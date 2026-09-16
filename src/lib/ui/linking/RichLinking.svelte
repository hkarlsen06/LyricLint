<script lang="ts">
	import { untrack } from 'svelte';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	import { projectOffset, renderProfile } from '$lib/conversion/index.js';
	import { conversionSectionRanges } from '$lib/conversion/links.js';
	import type { TextRange } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let {
		controller,
		active = true,
		onShowEditor
	}: {
		controller: WorkbenchController;
		active?: boolean;
		onShowEditor?: () => void | Promise<void>;
	} = $props();
	let selected = $state<string[]>([]);
	let lastModel = untrack(() => controller.snapshot.conversion?.model);
	const model = $derived.by(() => {
		if (active) lastModel = controller.snapshot.conversion?.model;
		return lastModel;
	});
	const projection = $derived.by(() => {
		if (!model) return undefined;
		const rendered = renderProfile(model, 'musixmatch');
		return rendered.ok ? rendered.value : undefined;
	});
	const ranges = $derived(model ? conversionSectionRanges(model) : new Map<string, TextRange>());
	const names = $derived(
		new Map(
			(model?.sections ?? []).map((section, index) => [
				section.id,
				`${section.name.trim() || section.type || 'Section'} · section ${index + 1}`
			])
		)
	);
	const linked = $derived(new Set(model?.links.flatMap((link) => link.sectionIds) ?? []));
	const selectedGroups = $derived(
		model?.links.filter((link) => link.sectionIds.some((id) => selected.includes(id))) ?? []
	);
	const selectedNew = $derived(selected.filter((id) => names.has(id) && !linked.has(id)));
	const canLink = $derived(
		selectedGroups.length > 1 ||
			(selectedGroups.length === 1 && selectedNew.length > 0) ||
			selectedNew.length > 1
	);
	const actionLabel = $derived(
		selectedGroups.length > 1
			? 'Combine groups'
			: selectedGroups.length
				? 'Add sections'
				: 'Set up link'
	);

	function select(ids: string[], checked: boolean): void {
		selected = checked
			? [...new Set([...selected, ...ids])]
			: selected.filter((id) => !ids.includes(id));
	}
	function visible(range: TextRange): TextRange | undefined {
		if (!projection) return undefined;
		return {
			from: projectOffset(projection, range.from, 1),
			to: projectOffset(projection, range.to, -1)
		};
	}
	async function show(range: TextRange | undefined): Promise<void> {
		if (!range) return;
		const target = visible(range);
		if (!target) return;
		await onShowEditor?.();
		controller.showConversionPassage(target);
	}
	function lyrics(id: string): string {
		const range = ranges.get(id);
		const projected = range ? visible(range) : undefined;
		return projected && projection
			? projection.text.slice(projected.from, projected.to).trim()
			: '';
	}
	function line(id: string): number {
		const range = ranges.get(id);
		const projected = range ? visible(range) : undefined;
		return projected && projection ? lineNumberAt(projection.text, projected.from) : 1;
	}
	function apply(): void {
		const ids = [
			...new Set([...selectedGroups.flatMap((group) => group.sectionIds), ...selectedNew])
		];
		if (controller.applyConversionAction({ kind: 'linkSections', sectionIds: ids })) {
			selected = [];
			controller.feedback.announce(
				'Sections linked. Matching passages stay in sync; variations stay local.'
			);
		}
	}
</script>

<div class="panel-content rich-linking">
	<h2 tabindex="-1" data-linking-heading>Link repeated sections</h2>
	<p>Matching passages stay in sync. Each section keeps its own variations.</p>
	{#if model && model.sections.length > 0}
		{#if model.links.length > 0}
			<section aria-label="Linked sections">
				<h3>Linked sections</h3>
				{#each model.links as group (group.id)}
					<div class="rich-linking__group">
						<label class="rich-linking__choice">
							<input
								type="checkbox"
								checked={group.sectionIds.some((id) => selected.includes(id))}
								onchange={(event) => select(group.sectionIds, event.currentTarget.checked)}
							/>
							<span
								>Include linked group: {group.sectionIds
									.map((id) => names.get(id))
									.join(', ')}</span
							>
						</label>
						<ul aria-label="Sections in this group">
							{#each group.sectionIds as id (id)}
								<li>
									<strong>{names.get(id)}</strong>
									<div class="rich-linking__actions">
										<button
											type="button"
											class="button button--quiet"
											onclick={() => show(ranges.get(id))}>Show line {line(id)}</button
										>
										<button
											type="button"
											class="button button--quiet"
											aria-label={`Unlink ${names.get(id)}`}
											onclick={() =>
												controller.applyConversionAction({ kind: 'unlinkSection', sectionId: id })}
											>Unlink section</button
										>
									</div>
									<button
										type="button"
										class="button button--quiet"
										role="switch"
										aria-checked={controller.isConversionSectionLocal(id)}
										onclick={() => controller.toggleConversionSectionLocal(id)}
										aria-label={`Edit ${names.get(id)} only`}
									>
										{controller.isConversionSectionLocal(id)
											? 'Editing this section only'
											: 'Edit this section only'}
									</button>
								</li>
							{/each}
						</ul>
						{#if group.passages?.length}
							<details>
								<summary>Connected lyrics</summary>
								<ul class="rich-linking__passages">
									{#each group.passages as passage, index (index)}
										<li>
											<p class="rich-linking__lyrics">
												{model.content.slice(passage.members[0].from, passage.members[0].to) ||
													'Shared insertion point'}
											</p>
											<div class="rich-linking__actions">
												{#each passage.members as member (member.sectionId)}
													<button
														type="button"
														class="button button--quiet"
														onclick={() => show(member)}
														>Show in {names.get(member.sectionId)}</button
													>
												{/each}
											</div>
										</li>
									{/each}
								</ul>
							</details>
						{:else}
							<p>No exact passage is currently connected. Each section keeps its wording.</p>
						{/if}
					</div>
				{/each}
			</section>
		{/if}
		{#if model.sections.some((section) => !linked.has(section.id))}
			<section aria-label="Available to link">
				<h3>Available to link</h3>
				{#each model.sections.filter((section) => !linked.has(section.id)) as section (section.id)}
					<div class="rich-linking__section">
						<label class="rich-linking__choice">
							<input
								type="checkbox"
								checked={selected.includes(section.id)}
								onchange={(event) => select([section.id], event.currentTarget.checked)}
							/>
							<span>{names.get(section.id)}</span>
						</label>
						<details>
							<summary>Lyrics in {names.get(section.id)}</summary>
							<p class="rich-linking__lyrics">{lyrics(section.id) || 'Empty section'}</p>
							<button
								type="button"
								class="button button--quiet"
								onclick={() => show(ranges.get(section.id))}>Show line {line(section.id)}</button
							>
						</details>
					</div>
				{/each}
			</section>
		{/if}
		<div class="rich-linking__submit">
			<p>
				Choose sections or existing groups. Linking keeps their current lyrics and connects only
				unambiguous matching passages.
			</p>
			<button type="button" class="button button--contrast" disabled={!canLink} onclick={apply}
				>{actionLabel}</button
			>
		</div>
	{:else}
		<p>Add section boundaries in Song details to choose the performances you want to link.</p>
	{/if}
</div>

<style>
	.rich-linking,
	section,
	.rich-linking__group,
	.rich-linking__section,
	.rich-linking__submit {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	.rich-linking {
		gap: var(--space-5);
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
	}
	h3 {
		font-size: var(--font-size-md);
	}
	p {
		color: var(--color-text-muted);
		line-height: var(--line-height-body);
	}
	.rich-linking__choice {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		overflow-wrap: anywhere;
	}
	.rich-linking__choice input {
		flex: none;
	}
	.rich-linking__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.rich-linking__actions button {
		overflow-wrap: anywhere;
		white-space: normal;
		text-align: start;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-4);
	}
	li {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	li > button {
		justify-self: start;
		white-space: normal;
	}
	.rich-linking__group + .rich-linking__group,
	.rich-linking__section + .rich-linking__section {
		border-block-start: var(--border-width) solid var(--color-border);
		padding-block-start: var(--space-4);
	}
	summary {
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	details > p,
	details > ul {
		margin-block-start: var(--space-3);
	}
	.rich-linking__lyrics {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--color-text);
	}
	.rich-linking__submit > button {
		justify-self: start;
	}
</style>
