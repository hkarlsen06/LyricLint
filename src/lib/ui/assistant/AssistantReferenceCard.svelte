<script lang="ts">
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import type {
		AssistantAnchorFailureReason,
		AssistantReferenceRecord
	} from '$lib/assistant/types.js';

	/**
	 * One `show_lyrics` reference: the assistant pointing at a place in the
	 * 'scribe without proposing anything. Hovering the card — or pressing or
	 * focusing its quote, which is the finger's and the keyboard's path — reveals
	 * the quoted lines in the editor, exactly as hovering a proposal card
	 * previews its diff. Nothing is pending and nothing is asked, so the card
	 * carries no actions and outlives its turn.
	 *
	 * The quote's spans render with no markup whitespace between them, on one
	 * unbroken template line: the context strings end exactly where the exact
	 * text begins, so a formatter-introduced break there draws a space that is
	 * not in the lyric. `RuleSearchHighlight.svelte` documents the same trap.
	 */
	let {
		reference,
		assistant
	}: {
		reference: AssistantReferenceRecord;
		assistant: AssistantState;
	} = $props();

	const CONTEXT_LENGTH = 22;

	function flatten(text: string): string {
		return text.replace(/\n/gu, ' ⏎ ');
	}

	const before = $derived.by(() => {
		const text = flatten(reference.anchor.before);
		return text.length > CONTEXT_LENGTH ? `…${text.slice(-CONTEXT_LENGTH)}` : text;
	});
	const after = $derived.by(() => {
		const text = flatten(reference.anchor.after);
		return text.length > CONTEXT_LENGTH ? `${text.slice(0, CONTEXT_LENGTH)}…` : text;
	});

	// Re-resolved on every gesture rather than trusted from the record: a
	// reference outlives its turn, and the draft may have moved on. A quote that
	// no longer resolves reveals nothing, silently — the card asked no question,
	// so it owes no refusal.
	function reveal(): void {
		assistant.revealReference(reference.anchor);
	}

	function failureReason(reason: AssistantAnchorFailureReason | undefined): string {
		switch (reason) {
			case 'ambiguous':
				return "The quoted text appears more than once in the 'scribe.";
			default:
				return "The quoted text could not be found in the 'scribe.";
		}
	}

	// A constant rather than template text: the trailing space is part of the
	// announcement, and Svelte trims a text node's edge whitespace.
	const SR_PREFIX = "Show in the 'scribe: ";
</script>

{#snippet quote()}{#if before}<span class="assistant-proposal__context">{before}</span>{/if}<span
		class="assistant-reference__exact">{flatten(reference.anchor.exact)}</span
	>{#if after}<span class="assistant-proposal__context">{after}</span>{/if}{/snippet}

{#if reference.status === 'shown'}
	<article class="assistant-proposal assistant-reference" onpointerenter={reveal}>
		<button type="button" class="assistant-reference__quote" onclick={reveal} onfocus={reveal}>
			<span class="sr-only">{SR_PREFIX}</span>{@render quote()}
		</button>
		{#if reference.note}
			<p class="assistant-proposal__note">{reference.note}</p>
		{/if}
	</article>
{:else}
	<article class="assistant-proposal assistant-reference">
		<p class="assistant-reference__quote assistant-reference__quote--inert">{@render quote()}</p>
		{#if reference.note}
			<p class="assistant-proposal__note">{reference.note}</p>
		{/if}
		<p class="assistant-proposal__outcome">
			<strong>Not shown.</strong>
			{failureReason(reference.reason)}
		</p>
	</article>
{/if}
