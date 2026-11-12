<script lang="ts">
	// The destination's findings for an export output. The rows are this
	// surface's own chrome; from the meta line down a finding is drawn by the
	// same components as the Review card and the editor's popover.
	import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon';
	import type { Diagnostic, DiagnosticFix, SourceReference } from '#lib/core/types.js';
	import DiagnosticActions from '#lib/diagnostics/DiagnosticActions.svelte';
	import DiagnosticMeta from '#lib/diagnostics/DiagnosticMeta.svelte';
	import { diagnosticKey } from '#lib/diagnostics/order.js';

	let {
		format,
		status,
		diagnostics,
		sources,
		openKey,
		automatic,
		sections,
		lineFor,
		onOpen,
		onApplyFix,
		onFixAll,
		onIgnore,
		onRetry
	}: {
		/** The destination's name, as the toolbar prints it. */
		format: string;
		status: 'checking' | 'ready' | 'failed';
		diagnostics: readonly Diagnostic[];
		sources: ReadonlyMap<string, SourceReference>;
		openKey: string | undefined;
		/** How many findings one press can settle without a decision. */
		automatic: number;
		/** Musixmatch structure tags in song order; they are not part of the text. */
		sections: readonly string[];
		lineFor: (offset: number) => number;
		onOpen: (diagnostic: Diagnostic | undefined) => void;
		onApplyFix: (diagnostic: Diagnostic, fix: DiagnosticFix) => void;
		onFixAll: () => void;
		onIgnore: (diagnostic: Diagnostic) => void;
		onRetry: () => void;
	} = $props();
	const headingId = $props.id();
	const count = $derived(diagnostics.length);
</script>

<section class="export-checks" aria-labelledby={headingId}>
	<header class="export-checks__header">
		<h3 id={headingId}>{format} review</h3>
		<!-- Said once per change in the count, never per keystroke: the output is
		     re-checked while it is typed in. -->
		<p class="export-checks__count" role="status">
			{#if status === 'checking'}
				Checking…
			{:else if status === 'failed'}
				Not checked
			{:else if count === 0}
				Nothing to review
			{:else}
				{count} to review
			{/if}
		</p>
	</header>
	<div class="export-checks__scroll">
		{#if status === 'failed'}
			<div class="export-checks__note">
				<p>The {format} checks could not load. The output is still exact and can be copied.</p>
				<button type="button" class="button" onclick={onRetry}>Retry</button>
			</div>
		{:else if status === 'ready' && count === 0}
			<div class="export-checks__note export-checks__note--clean">
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="8" cy="8" r="6" />
					<path d="M5.4 8.2 7.2 10l3.4-3.6" />
				</svg>
				<p>This output raises none of the reviewed {format} checks.</p>
			</div>
		{:else if count > 0}
			{#if automatic > 0}
				<div class="export-checks__bulk">
					<button type="button" class="button export-checks__bulk-action" onclick={onFixAll}>
						<MagicWandIcon aria-hidden="true" size={14} weight="bold" />
						Fix {automatic}
						{automatic === 1 ? 'issue' : 'issues'} automatically
					</button>
				</div>
			{/if}
			<ol class="export-checks__list" aria-label={`${format} findings in this output`}>
				{#each diagnostics as diagnostic (diagnosticKey(diagnostic))}
					{@const open = diagnosticKey(diagnostic) === openKey}
					<li class:export-check--open={open}>
						<div class="export-check__head">
							<button
								type="button"
								class="export-check__show"
								aria-expanded={open}
								onclick={() => onOpen(open ? undefined : diagnostic)}
							>
								{diagnostic.message}
							</button>
							<DiagnosticMeta
								{diagnostic}
								{sources}
								location={`Line ${lineFor(diagnostic.from)}`}
							/>
						</div>
						{#if open}
							<div class="export-check__body">
								<p class="diagnostic-explanation">{diagnostic.explanation}</p>
								<!-- The highlight in the output is this row's preview, and it is
							     already drawn, so the two preview hooks have nothing to add. -->
								<DiagnosticActions
									{diagnostic}
									onPreviewFix={() => {}}
									onCancelPreview={() => {}}
									onApplyFix={(fix) => onApplyFix(diagnostic, fix)}
									onIgnore={() => onIgnore(diagnostic)}
								/>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
	{#if sections.length}
		<div class="export-checks__sections">
			<h3>Section tags</h3>
			<p>Musixmatch takes structure as tags, so these are not in the text.</p>
			<ol>
				{#each sections as section, index (index)}
					<li>{section}</li>
				{/each}
			</ol>
		</div>
	{/if}
</section>

<style>
	.export-checks {
		--panel-inset: var(--space-4);
		display: flex;
		min-height: 0;
		flex-direction: column;
		background: var(--color-chrome);
	}
	/* The findings scroll; the heading above and the section tags below stay. */
	.export-checks__scroll {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
	}
	h3,
	p,
	ol {
		margin: 0;
	}
	.export-checks__header {
		display: flex;
		padding: var(--space-3) var(--panel-inset) var(--space-2);
		gap: var(--space-2);
		align-items: baseline;
		justify-content: space-between;
	}
	h3 {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}
	.export-checks__count {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.export-checks__note {
		display: grid;
		padding: var(--space-2) var(--panel-inset) var(--space-4);
		gap: var(--space-2);
		justify-items: start;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.export-checks__note--clean {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
	}
	.export-checks__note--clean svg {
		width: var(--space-5);
		height: var(--space-5);
		color: var(--color-success);
	}
	.export-checks__bulk {
		padding: 0 var(--panel-inset) var(--space-2);
	}
	.export-checks__bulk-action {
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-2-5) var(--space-1) var(--space-2);
		gap: var(--space-1-5);
		font-size: var(--font-size-xs);
	}
	.export-checks__bulk-action :global(svg) {
		flex: none;
		color: var(--color-accent);
	}
	.export-checks__list {
		display: grid;
		padding: 0 var(--space-2) var(--space-3);
		gap: var(--space-0-5);
		list-style: none;
	}
	.export-checks__list > li {
		position: relative;
		border-radius: var(--radius-panel);
	}
	/* The open finding rises, as the Review card does: the one surface in the
	   rail, with the accent rail down its leading edge. */
	.export-check--open {
		background: var(--color-surface);
		box-shadow: var(--shadow-raised);
	}
	.export-check--open::before {
		position: absolute;
		inset-block: var(--space-2);
		inset-inline-start: 0;
		width: var(--space-0-5);
		border-radius: var(--radius-pill);
		background: var(--color-accent);
		content: '';
	}
	.export-check__head {
		position: relative;
		display: grid;
		padding: var(--space-2-5) var(--space-2);
		gap: var(--space-1);
	}
	/* The whole head is the press target; the citation link lifts above it. */
	.export-check__show {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-ui);
		text-align: start;
		cursor: pointer;
	}
	.export-check__show::after {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-panel);
		content: '';
	}
	.export-check__show:focus-visible {
		outline: none;
	}
	.export-check__show:focus-visible::after {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: calc(-1 * var(--focus-ring-width));
	}
	.export-checks__list > li:not(.export-check--open):hover {
		background: var(--color-fill-subtle);
	}
	.export-check__head :global(.diagnostic-meta :is(a, button)) {
		position: relative;
		z-index: 1;
	}
	.export-check__body {
		display: grid;
		padding: 0 var(--space-2) var(--space-3);
		gap: var(--space-3);
	}
	.export-checks__sections {
		display: grid;
		padding: var(--space-3) var(--panel-inset) var(--space-4);
		border-block-start: var(--border-width) solid var(--color-border);
		gap: var(--space-1-5);
	}
	.export-checks__sections p {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.export-checks__sections ol {
		display: flex;
		padding: 0;
		flex-wrap: wrap;
		gap: var(--space-1);
		counter-reset: section;
		list-style: none;
	}
	/* Categorical chips, numbered so the order survives a wrap. */
	.export-checks__sections li {
		padding: var(--space-0-5) var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--color-fill);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		counter-increment: section;
	}
	.export-checks__sections li::before {
		margin-inline-end: var(--space-1);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
		content: counter(section);
	}
	/* Stacked under the output there is no height to pin anything in, so the
	   rail scrolls as one column and the tags follow the findings. */
	@media (max-width: 52rem) {
		.export-checks {
			overflow-y: auto;
		}
		.export-checks__scroll {
			flex: none;
			overflow-y: visible;
		}
	}
	@media (pointer: coarse) {
		.export-checks__bulk-action,
		.export-checks__note .button {
			min-height: var(--control-height-touch);
		}
		.export-check__head {
			padding-block: var(--space-3);
		}
	}
</style>
