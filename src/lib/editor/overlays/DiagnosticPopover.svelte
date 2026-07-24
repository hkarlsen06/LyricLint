<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic, DiagnosticFix, SourceReference } from '../../core/types.js';
	import type { ScreenRect } from '../contracts.js';
	import { safeExternalUrl } from './diagnostic-popover.js';

	interface Props {
		diagnostic: Diagnostic;
		sources?: readonly SourceReference[];
		anchor?: ScreenRect;
		takeFocus?: boolean;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: () => void;
		onDismiss?: () => void;
	}

	let {
		diagnostic,
		sources = [],
		anchor,
		takeFocus = false,
		onPreviewFix,
		onCancelPreview,
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

	// Mouse-opened popovers close on their own when the pointer wanders away
	// from both the popover and its anchor; a grace margin plus a short delay
	// keeps the diagonal travel from badge to popover from closing it early.
	// Keyboard-opened popovers (takeFocus) are unaffected, and a popover the
	// user has tabbed into is never closed out from under the focus.
	$effect(() => {
		if (takeFocus) {
			return;
		}
		let timer: number | undefined;
		const margin = 28;
		const within = (
			rect: { left: number; right: number; top: number; bottom: number },
			x: number,
			y: number,
			pad: number
		) =>
			x >= rect.left - pad &&
			x <= rect.right + pad &&
			y >= rect.top - pad &&
			y <= rect.bottom + pad;
		const onMove = (event: PointerEvent) => {
			const rect = root?.getBoundingClientRect();
			if (!rect) {
				return;
			}
			const near =
				within(rect, event.clientX, event.clientY, margin) ||
				(anchor !== undefined && within(anchor, event.clientX, event.clientY, 12));
			if (near) {
				if (timer !== undefined) {
					clearTimeout(timer);
					timer = undefined;
				}
			} else if (timer === undefined) {
				timer = window.setTimeout(() => {
					if (!root?.contains(document.activeElement)) {
						onDismiss();
					}
				}, 250);
			}
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		return () => {
			window.removeEventListener('pointermove', onMove);
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		};
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
			onPreviewFix(fix);
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
			<p>Previewing this change in the editor.</p>
			<button
				type="button"
				onclick={() => {
					previewFix = undefined;
					onCancelPreview();
				}}>Cancel preview</button
			>
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
		z-index: var(--layer-popover);
		box-sizing: border-box;
		width: min(26rem, calc(100vw - 1rem));
		max-height: min(26rem, calc(100vh - 1rem));
		padding: var(--space-3);
		overflow-y: auto;
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		font-family: var(--font-ui);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-body);
	}

	.anchored {
		position: fixed;
	}

	strong {
		display: block;
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}

	p {
		max-width: 68ch;
		margin: var(--space-2) 0 var(--space-3);
	}

	.fixes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1-5);
		margin-block-end: var(--space-3);
	}

	button {
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: var(--color-control-hover);
	}

	button:active {
		background: var(--color-control-active);
	}

	button:focus-visible,
	a:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.fixes span {
		margin-inline-start: var(--space-1-5);
		color: color-mix(in oklch, currentColor 65%, transparent);
		font-size: var(--font-size-2xs);
	}

	.preview {
		margin-block-end: var(--space-3);
		padding: var(--space-2);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface-subtle);
	}

	.preview p {
		margin: 0 0 var(--space-2);
		font-weight: var(--font-weight-medium);
	}

	ul {
		margin: 0;
		padding: var(--space-2-5) 0;
		border-block: var(--border-width) solid var(--color-border);
		list-style: none;
	}

	li + li {
		margin-block-start: var(--space-2);
	}

	a {
		color: var(--color-accent);
	}

	time {
		display: block;
		color: color-mix(in oklch, currentColor 65%, transparent);
		font-size: var(--font-size-2xs);
	}

	.actions {
		display: flex;
		gap: var(--space-1-5);
		justify-content: flex-end;
		margin-block-start: var(--space-3);
	}

	@media (prefers-reduced-motion: no-preference) {
		button {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart),
				color var(--duration-fast) var(--ease-out-quart);
		}
	}
</style>
