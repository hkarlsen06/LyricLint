<script lang="ts">
	import InlineDiffText from '../primitives/InlineDiffText.svelte';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	let {
		before,
		leadingEllipsis = false,
		text,
		after,
		replacement,
		hidden,
		documentText,
		sources,
		onNavigate
	}: {
		before: string;
		leadingEllipsis?: boolean;
		text: string;
		after: string;
		replacement?: string;
		hidden: boolean;
		documentText: string;
		sources: { from: number; name: string }[];
		onNavigate?: (from: number) => void;
	} = $props();
	type Part = { text: string; kind: 'context' | 'mark' | 'del' | 'ins' };
	const rows = $derived.by(() => {
		const result: { parts: Part[]; offset: number | undefined }[] = [{ parts: [], offset: 0 }];
		let offset = 0;
		const parts: Part[] = [
			{ text: before, kind: 'context' },
			{ text, kind: replacement === undefined ? 'mark' : 'del' },
			...(replacement === undefined ? [] : [{ text: replacement, kind: 'ins' as const }]),
			{ text: after, kind: 'context' }
		];
		for (const [partIndex, part] of parts.entries()) {
			const lines = part.text.split('\n');
			for (const [index, value] of lines.entries()) {
				if (index > 0) {
					if (part.kind !== 'ins') offset += 1;
					result.push({ parts: [], offset: part.kind === 'ins' ? undefined : offset });
				}
				if (value) result.at(-1)!.parts.push({ text: value, kind: part.kind });
				if (part.kind !== 'ins')
					offset += value.length - (leadingEllipsis && partIndex === 0 && index === 0 ? 1 : 0);
			}
		}
		return result;
	});
</script>

<div class="excerpt">
	{#each rows as row, rowIndex (rowIndex)}
		<div class="excerpt__line">
			<span class="lyric-text"
				>{#each row.parts as part, partIndex (partIndex)}<InlineDiffText
						text={part.text}
						kind={part.kind}
						measurement={hidden}
					/>{/each}</span
			>
			<span class="excerpt__numbers">
				{#each sources as source (source.from)}
					{@const from = source.from + (row.offset ?? 0)}
					{@const number = lineNumberAt(documentText, from)}
					{#if row.offset === undefined}<span class="line-number" aria-label="Added line">+</span>
					{:else if onNavigate && !hidden}<button
							type="button"
							class="line-number"
							aria-label={`Go to ${source.name}, line ${number}`}
							onclick={() => onNavigate?.(from)}>{number}</button
						>
					{:else}<span class="line-number">{number}</span>{/if}
				{/each}
			</span>
		</div>
	{/each}
</div>

<style>
	.excerpt {
		display: grid;
	}
	.excerpt__line {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: baseline;
	}
	.excerpt {
		grid-template-columns: minmax(0, 1fr) max-content;
		column-gap: var(--space-3);
	}
	.excerpt__numbers {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		text-align: right;
	}
	.line-number {
		font: inherit;
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		background: none;
		border: 0;
		padding: 0;
		line-height: var(--line-height-editor);
	}
	button.line-number {
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: var(--space-0-5);
	}
	button.line-number:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
	.lyric-text {
		font-family: var(--font-lyrics);
		font-size-adjust: var(--font-lyrics-size-adjust);
		font-size: var(--font-size-editor);
		line-height: var(--line-height-editor);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--color-text-reading);
		min-height: 1lh;
	}
</style>
