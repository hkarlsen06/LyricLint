<script lang="ts">
	/** Presentation only: callers retain ownership of alignment and document coordinates. */
	let {
		text,
		kind = 'context',
		measurement = false,
		documentLength,
		blankLabel = false,
		underlineInsertion = true
	}: {
		text: string;
		kind?: 'context' | 'shared' | 'mark' | 'del' | 'ins';
		measurement?: boolean;
		documentLength?: number;
		blankLabel?: boolean;
		underlineInsertion?: boolean;
	} = $props();
	const tag = $derived(measurement || kind === 'context' || kind === 'shared' ? 'span' : kind);
</script>

<svelte:element
	this={tag}
	class={kind}
	class:insertion-underlined={kind === 'ins' && underlineInsertion}
	data-doc-len={documentLength}
	>{#if blankLabel && text === ''}<em>(blank line)</em>{:else}{text}{/if}</svelte:element
>

<style>
	.mark,
	.del,
	.ins {
		padding-inline: var(--inline-diff-padding);
		border-radius: var(--radius-sm);
	}
	.shared,
	em {
		color: var(--color-text-muted);
	}
	em {
		font-style: italic;
	}
	.mark {
		background: var(--color-warning-soft);
		color: inherit;
		text-decoration: underline dotted;
		text-underline-offset: var(--space-0-5);
	}
	.del {
		color: var(--color-danger);
		background: var(--color-danger-surface);
		text-decoration: line-through;
	}
	.ins {
		color: var(--color-text);
		background: var(--color-success-surface);
		text-decoration: none;
	}
	.insertion-underlined {
		text-decoration: underline;
	}
	.del + :global(.ins) {
		margin-inline-start: var(--inline-diff-gap);
	}
</style>
