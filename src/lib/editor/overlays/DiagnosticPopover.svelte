<script lang="ts">
	import type { Diagnostic, DiagnosticFix, SourceReference } from '../../core/types.js';
	import type { ScreenRect } from '../contracts.js';
	import { safeExternalUrl } from './diagnostic-popover.js';

	interface Props {
		diagnostic: Diagnostic;
		sources?: readonly SourceReference[];
		anchor?: ScreenRect;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: () => void;
		onDismiss?: () => void;
	}

	let {
		diagnostic,
		sources = [],
		anchor,
		onApplyFix,
		onIgnore,
		onDismiss = () => {}
	}: Props = $props();
	const citedSources = $derived(
		diagnostic.sourceIds.map((sourceId) => ({
			id: sourceId,
			source: sources.find((candidate) => candidate.id === sourceId)
		}))
	);
	const position = $derived(
		anchor
			? `left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, anchor.bottom + 6)}px;`
			: undefined
	);
</script>

<div
	class="popover severity-{diagnostic.severity}"
	class:anchored={anchor}
	style={position}
	role="dialog"
	tabindex="-1"
	aria-label="Diagnostic details"
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			onDismiss();
		}
	}}
>
	<strong>{diagnostic.message}</strong>
	<p>{diagnostic.explanation}</p>

	{#if diagnostic.fixes?.length}
		<div class="fixes" aria-label="Available fixes">
			{#each diagnostic.fixes as fix (`${fix.kind}:${fix.label}`)}
				<button type="button" onclick={() => onApplyFix(fix)}>
					{fix.label}
					<span>{fix.kind === 'safe' ? 'Safe fix' : 'Preview'}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if citedSources.length}
		<ul aria-label="Sources">
			{#each citedSources as citation (citation.id)}
				<li>
					{#if citation.source}
						{@const href = safeExternalUrl(citation.source.url)}
						{#if href}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a {href} target="_blank" rel="noopener noreferrer">
								{citation.source.pageTitle}: {citation.source.sectionTitle}
							</a>
						{:else}
							<span>{citation.source.pageTitle}: {citation.source.sectionTitle}</span>
						{/if}
						<time datetime={citation.source.lastVerifiedAt}>
							Verified {citation.source.lastVerifiedAt}
						</time>
					{:else}
						<span>Source {citation.id}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="actions">
		<button type="button" onclick={onIgnore}>Ignore for this session</button>
		<button type="button" onclick={onDismiss}>Close</button>
	</div>
</div>

<style>
	.popover {
		z-index: 32;
		box-sizing: border-box;
		width: min(26rem, calc(100vw - 1rem));
		max-height: min(26rem, calc(100vh - 1rem));
		padding: 0.8rem;
		overflow-y: auto;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.5rem;
		background: var(--ll-surface, oklch(0.985 0.006 78));
		color: var(--ll-text, oklch(0.24 0.015 70));
		box-shadow: 0 2px 8px oklch(0.2 0.01 70 / 0.14);
		font:
			400 0.8125rem/1.45 ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.anchored {
		position: fixed;
	}

	strong {
		display: block;
		font-size: 0.9375rem;
		line-height: 1.3;
	}

	p {
		max-width: 68ch;
		margin: 0.45rem 0 0.7rem;
	}

	.fixes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-block-end: 0.7rem;
	}

	button {
		padding: 0.38rem 0.55rem;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.375rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: var(--ll-hover, oklch(0.94 0.012 75));
	}

	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--ll-focus, oklch(0.58 0.14 55));
		outline-offset: 2px;
	}

	.fixes span {
		margin-inline-start: 0.35rem;
		color: color-mix(in oklch, currentColor 65%, transparent);
		font-size: 0.7rem;
	}

	ul {
		margin: 0;
		padding: 0.65rem 0;
		border-block: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		list-style: none;
	}

	li + li {
		margin-block-start: 0.45rem;
	}

	a {
		color: var(--ll-link, oklch(0.48 0.12 45));
	}

	time {
		display: block;
		color: color-mix(in oklch, currentColor 65%, transparent);
		font-size: 0.72rem;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		justify-content: flex-end;
		margin-block-start: 0.7rem;
	}
</style>
