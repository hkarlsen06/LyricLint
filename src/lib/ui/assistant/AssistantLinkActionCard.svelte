<script lang="ts">
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import type {
		AssistantLinkActionRecord,
		AssistantLinkFailureReason,
		AssistantLinkHeader
	} from '$lib/assistant/types.js';

	let {
		action,
		assistant,
		decidable
	}: {
		action: AssistantLinkActionRecord;
		assistant: AssistantState;
		/** Whether this turn still holds the live tool session — see the same
		 * prop on `AssistantToolTurn`. */
		decidable: boolean;
	} = $props();

	let resolving = $state(false);

	function ordinal(value: number): string {
		const tens = value % 100;
		if (tens >= 11 && tens <= 13) return `${value}th`;
		switch (value % 10) {
			case 1:
				return `${value}st`;
			case 2:
				return `${value}nd`;
			case 3:
				return `${value}rd`;
			default:
				return `${value}th`;
		}
	}

	function headerLabel(header: AssistantLinkHeader): string {
		return `${header.text.trim()}${header.occurrence > 1 ? ` (${ordinal(header.occurrence)})` : ''}`;
	}

	const heading = $derived.by(() => {
		const labels = action.headers.map(headerLabel);
		if (action.action === 'unlink') return `Unlink ${labels[0] ?? 'section'}`;
		if (labels.length < 2) return `Link ${labels[0] ?? 'sections'}`;
		if (labels.length === 2) return `Link ${labels[0]} and ${labels[1]}`;
		return `Link ${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
	});

	async function settle(outcome: 'approve' | 'reject'): Promise<void> {
		if (resolving || action.status !== 'pending') return;
		resolving = true;
		try {
			if (outcome === 'approve') await assistant.approveLinkAction(action.id);
			else await assistant.rejectLinkAction(action.id);
		} finally {
			resolving = false;
		}
	}

	function failureReason(reason: AssistantLinkFailureReason | undefined): string {
		switch (reason) {
			case 'not-found':
				return "One of those section headers could not be found in the 'scribe.";
			case 'not-linkable':
				return 'Only choruses, pre-choruses, and post-choruses can be linked.';
			case 'already-linked':
				return 'Those sections are already in one linked group.';
			case 'not-linked':
				return 'That section is not linked.';
			case 'apply-failed':
				return 'The section links changed before this action could be applied.';
			default:
				return 'The section-link change could not be applied.';
		}
	}
</script>

<article class="assistant-proposal assistant-link-action">
	<p class="assistant-link-action__title">{heading}</p>
	<p class="assistant-proposal__note">{action.note}</p>

	{#if action.status === 'pending' && !decidable}
		<p class="assistant-proposal__outcome">Left undecided.</p>
	{:else if action.status === 'pending'}
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
	{:else if action.status === 'applied'}
		<p class="assistant-proposal__outcome">
			{action.action === 'link' ? 'Linked.' : 'Unlinked.'}
		</p>
	{:else if action.status === 'rejected'}
		<p class="assistant-proposal__outcome">Rejected.</p>
	{:else}
		<p class="assistant-proposal__outcome">
			<strong>Failed.</strong>
			{failureReason(action.reason)}
		</p>
	{/if}
</article>
