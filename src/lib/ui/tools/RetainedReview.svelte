<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { sectionTypeChoices } from '#lib/conversion/section-types.js';
	import type { SectionRecord } from '#lib/conversion/model.js';
	import type { RetainedFinding } from '#lib/conversion/review.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let {
		controller,
		findings
	}: { controller: WorkbenchController; findings: readonly RetainedFinding[] } = $props();
	let selected = $state(0);
	const position = $derived(Math.min(selected, findings.length - 1));
	const current = $derived(findings[position]);
	let container = $state<HTMLElement>();
	let heading = $state<HTMLHeadingElement>();
	let choice = $state<NonNullable<SectionRecord['type']> | ''>('');
	let choiceFor = $state('');
	let reviewedFor = $state('');
	const reviewOwner = $derived(`${controller.draftId}:${controller.profile}`);
	const hasSections = $derived((controller.snapshot.conversion?.model.sections.length ?? 0) > 0);
	const currentId = $derived(current ? `${reviewOwner}:${current.id}` : undefined);
	const chosen = $derived(choiceFor === currentId ? choice : '');
	// Capture focus before a keyed decision leaves, including edits and Undo outside this form.
	$effect.pre(() => {
		const id = currentId;
		untrack(() => {
			if (id) reviewedFor = reviewOwner;
			const active = document.activeElement;
			const owned = active instanceof HTMLElement && container?.contains(active);
			choiceFor = id ?? '';
			choice = '';
			if (owned)
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
							<label
								>Musixmatch section type
								<select
									value={chosen}
									onchange={(event) => {
										const value = event.currentTarget.value;
										choiceFor = currentId ?? '';
										choice = sectionTypeChoices.find((type) => type === value) ?? '';
									}}
								>
									<option value="">Choose a section type</option>
									{#each sectionTypeChoices as type (type)}<option value={type}
											>{type === 'PreChorus' ? 'Pre-Chorus' : type}</option
										>{/each}
								</select>
							</label>
							<button type="submit" class="button button--contrast" disabled={!chosen}
								>Save section type</button
							>
						</form>
					{:else if finding.kind === 'repeat-header'}
						<button
							type="button"
							class="button button--quiet"
							onclick={() => controller.editRetainedRepeatHeader(finding.sectionId)}
							>Edit header in Genius</button
						>
					{:else}
						<button
							type="button"
							class="button button--quiet"
							onclick={() => controller.openSectionDetails(finding.sectionId ?? 'new', 'review')}
							>Review in Song</button
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if findings.length}<div class="tool-actions">
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
	</section>
{/if}

<style>
	form,
	label {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	form {
		margin-block: var(--space-3);
	}
	select {
		width: 100%;
		min-width: 0;
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

	.retained-review {
		padding: var(--space-4);
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
