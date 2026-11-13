<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { sectionTypeOptions } from '#lib/conversion/section-types.js';
	import type { SectionRecord } from '#lib/conversion/model.js';
	import type { RetainedFinding } from '#lib/conversion/review.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { Select } from '../primitives/select/index.js';
	let {
		controller,
		findings
	}: { controller: WorkbenchController; findings: readonly RetainedFinding[] } = $props();
	let selected = $state(0);
	const position = $derived(Math.min(selected, findings.length - 1));
	const current = $derived(findings[position]);
	let container = $state<HTMLElement>();
	let heading = $state<HTMLHeadingElement>();
	let pending = $state<{
		id: string;
		revision: number;
		type: NonNullable<SectionRecord['type']>;
	}>();
	let reviewedFor = $state('');
	const reviewOwner = $derived(`${controller.draftId}:${controller.profile}`);
	const hasSections = $derived((controller.snapshot.conversion?.model.sections.length ?? 0) > 0);
	const currentId = $derived(current ? `${reviewOwner}:${current.id}` : undefined);
	const staleChoice = $derived(
		pending !== undefined &&
			pending.id === currentId &&
			pending.revision !== controller.snapshot.revision
	);
	const chosen = $derived(pending?.id === currentId && !staleChoice ? (pending?.type ?? '') : '');
	// Capture focus before a keyed decision leaves, including edits and Undo outside this form.
	$effect.pre(() => {
		const id = currentId;
		const selectedType = chosen;
		untrack(() => {
			if (id) reviewedFor = reviewOwner;
			const active = document.activeElement;
			const owned = active instanceof HTMLElement && container?.contains(active);
			if (pending?.id !== id) pending = undefined;
			if (owned && !selectedType)
				void tick().then(() => {
					if (!active.isConnected || (active instanceof HTMLButtonElement && active.disabled))
						heading?.focus({ preventScroll: true });
				});
		});
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (current?.kind !== 'section-type' || !chosen) return;
		if (
			!controller.applyConversionAction({
				kind: 'setSectionType',
				sectionId: current.sectionId,
				type: chosen
			})
		)
			return;
		pending = undefined;
		controller.feedback.announce('Section type saved.');
		await tick();
		heading?.focus({ preventScroll: true });
	}
</script>

{#if findings.length || (reviewedFor === reviewOwner && (!controller.isEmpty || hasSections))}
	<section
		bind:this={container}
		class="retained-review"
		aria-label="Retained details needing review"
	>
		<h2 bind:this={heading} tabindex="-1">Retained details ({findings.length})</h2>
		{#if !findings.length}<p role="status">No retained details need review.</p>{/if}
		<ul>
			{#each current ? [current] : [] as finding (finding.id)}
				<li>
					<div class="retained-review__message">
						{#each findings as item (item.id)}<p
								class="retained-review__measure"
								aria-hidden="true"
							>
								{item.message}
							</p>{/each}
						<p aria-live="polite">{finding.message}</p>
					</div>
					{#if finding.kind === 'section-type'}
						<form onsubmit={save}>
							<Select
								label="Musixmatch section type"
								placeholder="Choose a section type"
								value={chosen}
								options={sectionTypeOptions}
								onchange={(type) => {
									pending = currentId
										? { id: currentId, revision: controller.snapshot.revision, type }
										: undefined;
								}}
							/>
							<button type="submit" class="button button--contrast" disabled={!chosen}
								>Save section type</button
							>
						</form>
					{:else if finding.kind === 'repeat-header'}
						<button
							type="button"
							class="button button--quiet button--flush"
							onclick={() => controller.editRetainedRepeatHeader(finding.sectionId)}
							>{controller.profile === 'musixmatch'
								? 'Open Genius export'
								: 'Edit header in Genius'}</button
						>
					{:else}
						<button
							type="button"
							class="button button--quiet button--flush"
							onclick={() => controller.openSectionDetails(finding.sectionId ?? 'new', 'review')}
							>Review in Song</button
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if findings.length > 1}<div class="tool-actions">
				<button
					type="button"
					class="button button--quiet"
					disabled={position <= 0}
					onclick={() => (selected = position - 1)}>Previous detail</button
				>
				<span>{position + 1} of {findings.length}</span>
				<button
					type="button"
					class="button button--quiet"
					disabled={position >= findings.length - 1}
					onclick={() => (selected = position + 1)}>Next detail</button
				>
			</div>{/if}
		{#if staleChoice}<p role="status">The document changed. Choose the section type again.</p>{/if}
	</section>
{/if}

<style>
	form {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	form {
		margin-block: var(--space-3);
	}
	form :global(.ui-select .ui-select__trigger) {
		font-size: var(--font-size-editor);
		min-height: var(--control-height-touch);
	}
	button {
		min-height: var(--control-height-touch);
		white-space: normal;
	}
	.tool-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.tool-actions span {
		white-space: nowrap;
	}
	/* The row starts on the text column, as a lone quiet button does. */
	.tool-actions > .button--quiet:first-child {
		margin-inline-start: calc(-1 * var(--control-padding-inline));
	}

	.retained-review__message {
		display: grid;
	}
	.retained-review__message p {
		grid-area: 1 / 1;
		overflow-wrap: anywhere;
	}
	.retained-review__measure {
		visibility: hidden;
	}

	/* On the Review column's own inset, level with its heading and chips. */
	.retained-review {
		padding: var(--space-4) var(--panel-inset);
	}
	.retained-review h2 {
		font-size: var(--font-size-md);
	}
	.retained-review ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.retained-review li {
		padding-block: var(--space-2);
	}
	.retained-review p {
		margin-block: 0 var(--space-1);
	}
</style>
