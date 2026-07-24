<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic, DiagnosticFix, SourceReference } from '../../core/types.js';
	import type { ScreenRect } from '../contracts.js';
	import { safeExternalUrl } from './diagnostic-popover.js';

	interface Props {
		diagnostic: Diagnostic;
		sources?: readonly SourceReference[];
		anchor?: ScreenRect;
		documentText?: string;
		takeFocus?: boolean;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: () => void;
		onDismiss?: () => void;
	}

	let {
		diagnostic,
		sources = [],
		anchor,
		documentText = '',
		takeFocus = false,
		onApplyFix,
		onIgnore,
		onDismiss = () => {}
	}: Props = $props();
	let root: HTMLDivElement;
	let previewFix = $state<DiagnosticFix | undefined>();
	let previousDiagnosticKey = $state('');
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
	const previewChanges = $derived(
		previewFix?.edit.edits.map((edit) => ({
			before: documentText.slice(edit.from, edit.to),
			after: edit.insert
		})) ?? []
	);

	$effect(() => {
		const diagnosticKey = `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`;
		if (diagnosticKey !== previousDiagnosticKey) {
			previousDiagnosticKey = diagnosticKey;
			previewFix = undefined;
		}
	});

	$effect(() => {
		if (!takeFocus) {
			return;
		}
		const diagnosticAtOpen = diagnostic;
		void tick().then(() => {
			if (diagnostic !== diagnosticAtOpen) {
				return;
			}
			const firstFix = root?.querySelector<HTMLButtonElement>('.fixes button');
			(firstFix ?? root)?.focus();
		});
	});

	// Compare fixes by their stable key, not object identity: reactive $state
	// proxies make `===` unreliable between the stored fix and the render item.
	function fixKey(fix: DiagnosticFix): string {
		return `${fix.kind}:${fix.label}`;
	}

	function isPendingPreview(fix: DiagnosticFix): boolean {
		return previewFix !== undefined && fixKey(previewFix) === fixKey(fix);
	}

	function activateFix(fix: DiagnosticFix): void {
		if (fix.kind === 'preview' && !isPendingPreview(fix)) {
			previewFix = fix;
			return;
		}
		onApplyFix(fix);
	}
</script>

<div
	bind:this={root}
	class="popover severity-{diagnostic.severity}"
	class:anchored={anchor}
	style={position}
	role={takeFocus ? 'dialog' : undefined}
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
				<button type="button" onclick={() => activateFix(fix)}>
					{isPendingPreview(fix) ? `Apply ${fix.label}` : fix.label}
					<span>
						{fix.kind === 'safe' ? 'Safe fix' : isPendingPreview(fix) ? 'Confirm' : 'Preview'}
					</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if previewFix}
		<div class="preview" aria-live="polite">
			<p>Review the change, then activate the fix again to apply it.</p>
			{#each previewChanges as change, index (`${index}:${change.before}:${change.after}`)}
				<dl>
					<div>
						<dt>Before</dt>
						<dd><code>{change.before || '(empty)'}</code></dd>
					</div>
					<div>
						<dt>After</dt>
						<dd><code>{change.after || '(empty)'}</code></dd>
					</div>
				</dl>
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

	.preview {
		margin-block-end: 0.7rem;
		padding: 0.55rem;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.375rem;
		background: var(--color-surface-subtle, oklch(0.953 0.01 78));
	}

	.preview p {
		margin: 0 0 0.45rem;
		font-weight: 550;
	}

	.preview dl {
		display: grid;
		grid-template-columns: minmax(4rem, auto) 1fr;
		gap: 0.25rem 0.55rem;
		margin: 0;
	}

	.preview dl + dl {
		margin-block-start: 0.45rem;
		padding-block-start: 0.45rem;
		border-block-start: 1px solid var(--ll-border, oklch(0.78 0.012 75));
	}

	.preview dl div {
		display: contents;
	}

	.preview dt {
		font-weight: 650;
	}

	.preview dd {
		min-width: 0;
		margin: 0;
	}

	.preview code {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font:
			0.75rem/1.4 ui-monospace,
			monospace;
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
