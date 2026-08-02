<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import type { WordDiffSegment } from '$lib/core/word-diff.js';
	import { wordDiffSegments } from '$lib/core/word-diff.js';
	import { acquirePreview } from '$lib/diagnostics/preview-slot.js';
	import type { AssistantProposalRecord } from '$lib/assistant/types.js';

	let {
		proposal,
		assistant
	}: {
		proposal: AssistantProposalRecord;
		assistant: AssistantState;
	} = $props();

	const segments = $derived(wordDiffSegments(proposal.anchor.exact, proposal.replacement));
	let releasePreview: (() => void) | undefined;
	let resolving = $state(false);

	const CONTEXT_LENGTH = 22;

	function contextText(segment: WordDiffSegment, index: number): string {
		if (segment.kind !== 'shared') return '';
		const text = segment.text.replace(/\n/gu, ' ⏎ ');
		if (index === 0) {
			return text.length > CONTEXT_LENGTH ? `…${text.slice(-CONTEXT_LENGTH)}` : text;
		}
		if (index === segments.length - 1) {
			return text.length > CONTEXT_LENGTH ? `${text.slice(0, CONTEXT_LENGTH)}…` : text;
		}
		if (text.length > CONTEXT_LENGTH * 2) {
			return `${text.slice(0, CONTEXT_LENGTH)}…${text.slice(-CONTEXT_LENGTH)}`;
		}
		return text;
	}

	function beginPreview(): void {
		if (proposal.status !== 'pending' || releasePreview) return;
		releasePreview = acquirePreview(
			() => {
				assistant.previewProposal(proposal.id);
			},
			() => assistant.endProposalPreview(proposal.id)
		);
	}

	function endPreview(): void {
		releasePreview?.();
		releasePreview = undefined;
	}

	function leavesCard(event: FocusEvent): void {
		const next = event.relatedTarget;
		const card = event.currentTarget as HTMLElement;
		if (next instanceof Node && card.contains(next)) return;
		endPreview();
	}

	async function settle(outcome: 'approve' | 'reject'): Promise<void> {
		if (resolving || proposal.status !== 'pending') return;
		resolving = true;
		endPreview();
		try {
			if (outcome === 'approve') await assistant.approveProposal(proposal.id);
			else await assistant.rejectProposal(proposal.id);
		} finally {
			resolving = false;
		}
	}

	function failureReason(reason: string | undefined): string {
		switch (reason) {
			case 'not-found':
				return 'The quoted text could not be found in the draft.';
			case 'ambiguous':
				return 'The quoted text appears more than once in the draft.';
			case 'apply-failed':
				return 'The draft changed before the edit could be applied.';
			default:
				return reason
					? `The edit could not be applied: ${reason}.`
					: 'The edit could not be applied.';
		}
	}

	$effect(() => {
		if (proposal.status !== 'pending') endPreview();
	});

	onDestroy(endPreview);
</script>

<article
	class="assistant-proposal"
	onpointerenter={beginPreview}
	onpointerleave={endPreview}
	onfocusin={beginPreview}
	onfocusout={leavesCard}
>
	<p class="assistant-proposal__diff" aria-label="Proposed change">
		{#each segments as segment, index (index)}
			{#if segment.kind === 'shared'}
				<span class="assistant-proposal__context">{contextText(segment, index)}</span>
			{:else}
				{#if segment.deleted}<del>{segment.deleted.replace(/\n/gu, ' ⏎ ')}</del>{/if}
				{#if segment.inserted}<ins>{segment.inserted.replace(/\n/gu, ' ⏎ ')}</ins>{/if}
			{/if}
		{/each}
	</p>
	<p class="assistant-proposal__note">{proposal.note}</p>

	{#if proposal.status === 'pending'}
		<div class="assistant-proposal__actions">
			<button
				type="button"
				class="button button--contrast"
				disabled={resolving}
				onclick={() => void settle('approve')}>Approve</button
			>
			<button
				type="button"
				class="button button--quiet"
				disabled={resolving}
				onclick={() => void settle('reject')}>Reject</button
			>
		</div>
	{:else if proposal.status === 'applied'}
		<p class="assistant-proposal__outcome">Applied.</p>
	{:else if proposal.status === 'rejected'}
		<p class="assistant-proposal__outcome">Rejected.</p>
	{:else}
		<p class="assistant-proposal__outcome">
			<strong>Failed.</strong>
			{failureReason(proposal.reason)}
		</p>
	{/if}
</article>
