<script lang="ts">
	import { tick, untrack } from 'svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { dismissOnOutside } from '#lib/interaction/dismiss.js';
	import { profileLabels } from '#lib/profiles/types.js';
	import { otherProfile } from '#lib/persistence/writing.js';
	import { parseDocument } from '#lib/core/parser.js';
	import type { Diagnostic, DiagnosticFix } from '#lib/core/types.js';
	import { diagnosticKey } from '#lib/diagnostics/order.js';
	import {
		applyFixes,
		exportFindingKey,
		exportFindings,
		lineOfOffset,
		outputSegments
	} from '../state/export-checks.js';
	import { buildRuleContext } from '../state/wiring.js';
	import ExportChecks from './ExportChecks.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	type RulesEngine = Pick<typeof import('#lib/rules/engine.js'), 'runRules' | 'collectSafeFixes'>;

	let {
		controller,
		loadRules = () => import('#lib/rules/engine.js')
	}: {
		controller: WorkbenchController;
		/** Injectable so a component test can stand in for the lazy rules chunk. */
		loadRules?: () => Promise<RulesEngine>;
	} = $props();
	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let opener: HTMLButtonElement;
	let discard = $state.raw<HTMLButtonElement>();
	let open = $state(false);
	let output = $state('');
	let session = 0;
	let error = $state('');
	let copied = $state(false);
	let copyRequest = 0;
	const target = $derived(otherProfile(controller.profile));

	// The destination's own rules, run over the output as it stands. The main
	// draft is reviewed in its own format, so without this the first reader to
	// check the other format's conventions was the other platform.
	let engine = $state.raw<RulesEngine>();
	let checkStatus = $state<'checking' | 'ready' | 'failed'>('checking');
	let findings = $state.raw<Diagnostic[]>([]);
	let sections = $state.raw<string[]>([]);
	let left = $state.raw<ReadonlySet<string>>(new Set());
	let openFinding = $state.raw<Diagnostic>();
	let field = $state<HTMLTextAreaElement>();
	let marks = $state<HTMLDivElement>();
	let checkTimer: ReturnType<typeof setTimeout> | undefined;
	const context = $derived(
		buildRuleContext(
			controller.language,
			controller.performers,
			controller.ruleSet?.version ?? '',
			0,
			target
		)
	);
	const shown = $derived(
		findings.filter((finding) => !left.has(exportFindingKey(finding, output)))
	);
	const automatic = $derived(engine ? engine.collectSafeFixes(shown).length : 0);
	// A field shows the empty line after a final line break; a block does not
	// until something follows it, so the layer always ends in one more.
	const segments = $derived([...outputSegments(output, shown, openFinding), { text: '\n' }]);

	function requestRules(): void {
		checkStatus = 'checking';
		void loadRules().then(
			(loaded) => {
				engine = loaded;
				check();
			},
			() => {
				checkStatus = 'failed';
			}
		);
	}
	function check(): void {
		clearTimeout(checkTimer);
		if (!engine) return;
		findings = exportFindings(engine.runRules(parseDocument(output), context));
		// The open row follows its finding by identity; when the fix settled it,
		// the row closes rather than opening whatever now sits at that offset.
		const key = openFinding && exportFindingKey(openFinding, output);
		openFinding = key
			? findings.find((finding) => exportFindingKey(finding, output) === key)
			: undefined;
		checkStatus = 'ready';
	}
	function checkSoon(): void {
		clearTimeout(checkTimer);
		checkTimer = setTimeout(check, 250);
	}
	/** Bring the flagged text into view without taking focus from the rail. */
	async function reveal(): Promise<void> {
		await tick();
		const mark = marks?.querySelector<HTMLElement>('[data-open]');
		if (!mark || !field) return;
		const top = mark.offsetTop;
		if (top < field.scrollTop || top + mark.offsetHeight > field.scrollTop + field.clientHeight)
			field.scrollTop = Math.max(0, top - field.clientHeight / 3);
	}
	function replaceOutput(text: string): void {
		save(text);
		check();
	}

	let lastRequest = 0;
	$effect(() => {
		const request = controller.exportSession;
		if (request > lastRequest) {
			lastRequest = request;
			untrack(show);
		}
	});
	function show() {
		copyRequest += 1;
		const generated = controller.getExport();
		if (generated === undefined) return;
		session = controller.draftSession;
		output = generated;
		error = '';
		copied = false;
		left = new Set();
		openFinding = undefined;
		findings = [];
		sections = controller.exportSections();
		if (engine) check();
		else requestRules();
		// Native dialog focus restoration must never target the lyric editor.
		opener.focus();
		open = true;
		dialog.showModal();
	}
	function close() {
		copyRequest += 1;
		if (error) {
			discard?.focus();
			return;
		}
		clearTimeout(checkTimer);
		open = false;
		dialog.close();
	}
	function save(text: string) {
		copyRequest += 1;
		output = text;
		copied = false;
		error = controller.setExport(output, session)
			? ''
			: 'This output could not be saved. Shorten it to save, or copy or download it here.';
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (!error) return;
		event.preventDefault();
		event.returnValue = '';
	}}
/>

<button
	bind:this={opener}
	type="button"
	class="button button--quiet"
	aria-haspopup="dialog"
	onclick={show}
>
	<ExportIcon aria-hidden="true" size={16} weight="bold" />
	Export to {profileLabels[target]}
</button>
<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={() => {
		open = false;
	}}
>
	{#if open}
		<!-- One document pane between a title bar and an action band, the shape
		     Geist gives a modal: the output is the thing being edited, so it runs
		     edge to edge and fills the dialog instead of sitting in a box with a
		     resize grip. -->
		<div class="export-surface" {@attach dismissOnOutside(close)}>
			<div class="export-header">
				<div class="export-heading">
					<h2 id={titleId}>{profileLabels[target]} export</h2>
					<p>
						Edit this output for export. Make lyric changes in your main {profileLabels[
							controller.profile
						]} draft.
					</p>
				</div>
				<button
					type="button"
					class="icon-button button--quiet export-close"
					aria-label="Close"
					onclick={close}
				>
					<XIcon aria-hidden="true" size={16} weight="bold" />
				</button>
			</div>
			<div class="export-body">
				<!-- The flagged text is marked on a layer behind the field: same face,
				     same box, same scroll, so each mark sits under its own words. -->
				<div class="export-output">
					<div bind:this={marks} class="export-marks" aria-hidden="true">
						{#each segments as segment, index (index)}{#if segment.severity || segment.open || segment.line}<mark
									class={`export-mark--${segment.severity ?? 'place'}`}
									data-open={segment.open}
									data-line={segment.line}>{segment.text}</mark
								>{:else}{segment.text}{/if}{/each}
					</div>
					<textarea
						bind:this={field}
						aria-label={`${profileLabels[target]} output`}
						bind:value={output}
						oninput={(event) => {
							save(event.currentTarget.value);
							checkSoon();
						}}
						onscroll={(event) => {
							if (marks) marks.scrollTop = event.currentTarget.scrollTop;
						}}
						spellcheck="false"></textarea>
				</div>
				<ExportChecks
					format={profileLabels[target]}
					status={checkStatus}
					diagnostics={shown}
					sources={controller.sources}
					openKey={openFinding && diagnosticKey(openFinding)}
					{automatic}
					{sections}
					lineFor={(offset) => lineOfOffset(output, offset)}
					onOpen={(finding) => {
						openFinding = finding;
						void reveal();
					}}
					onApplyFix={(_finding: Diagnostic, fix: DiagnosticFix) =>
						replaceOutput(applyFixes(output, [fix]))}
					onFixAll={() =>
						engine && replaceOutput(applyFixes(output, engine.collectSafeFixes(shown)))}
					onIgnore={(finding) => {
						left = new Set([...left, exportFindingKey(finding, output)]);
						if (openFinding && diagnosticKey(openFinding) === diagnosticKey(finding))
							openFinding = undefined;
					}}
					onRetry={requestRules}
				/>
			</div>
			{#if error}<p class="export-error" role="alert">
					<WarningIcon aria-hidden="true" size={16} weight="bold" />{error}
				</p>{/if}
			<div class="export-actions">
				{#if error}
					<button
						bind:this={discard}
						type="button"
						class="button button--quiet"
						onclick={() => {
							error = '';
							close();
						}}>Discard unsaved output and close</button
					>
				{/if}
				<button type="button" class="button button--quiet export-edit" onclick={close}
					>Edit lyrics</button
				>
				<button
					type="button"
					class="button export-download"
					onclick={() => controller.downloadExport(output)}
				>
					<DownloadSimpleIcon aria-hidden="true" size={16} weight="bold" />
					Download .txt</button
				>
				<button
					type="button"
					class="button button--contrast export-copy"
					onclick={async () => {
						const request = ++copyRequest;
						const result = await controller.copyExport(output);
						if (request === copyRequest && session === controller.draftSession) copied = result;
					}}
				>
					{#if copied}<CheckIcon aria-hidden="true" size={16} weight="bold" />{:else}<CopyIcon
							aria-hidden="true"
							size={16}
							weight="bold"
						/>{/if}
					{copied ? 'Copied' : 'Copy'}</button
				>
			</div>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: min(68rem, calc(100vw - var(--space-4)));
		max-width: none;
		height: min(46rem, calc(100dvh - var(--space-6)));
		max-height: calc(100dvh - var(--space-4));
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		overflow: hidden;
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}
	dialog::backdrop {
		background: var(--color-backdrop);
	}
	.export-surface {
		display: grid;
		height: 100%;
		grid-template-rows: auto minmax(10rem, 1fr) auto auto;
		overflow: auto;
	}
	.export-header {
		display: flex;
		padding: var(--space-4) var(--space-4) var(--space-3) var(--space-5);
		gap: var(--space-3);
		align-items: flex-start;
		justify-content: space-between;
	}
	.export-heading {
		display: grid;
		gap: var(--space-1);
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-heading);
		line-height: var(--line-height-tight);
	}
	.export-heading p {
		max-width: var(--measure-prose);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.export-close {
		flex: none;
		margin-block-start: calc(-1 * var(--space-1));
	}
	/* The output and what the destination's rules say about it, side by side:
	   the document keeps the width, the review is a rail on chrome. The
	   hairlines above and below are the pane's edges. */
	.export-body {
		display: grid;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		border-block: var(--border-width) solid var(--color-border);
	}
	.export-body > :global(.export-checks) {
		border-inline-start: var(--border-width) solid var(--color-border);
	}
	.export-output {
		position: relative;
		min-height: 0;
		background: var(--color-surface);
	}
	/* The output is a document, so it takes the editor's paper, face and
	   measure. The field and the layer of marks behind it share every metric
	   that decides where a line wraps. */
	textarea,
	.export-marks {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		padding: var(--space-4) var(--space-5);
		border: 0;
		border-radius: 0;
		margin: 0;
		overflow-y: auto;
		scrollbar-gutter: stable;
		font-family: var(--font-lyrics);
		font-size: var(--font-size-editor);
		font-size-adjust: var(--font-lyrics-size-adjust);
		line-height: var(--line-height-editor);
		letter-spacing: normal;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	textarea {
		resize: none;
		background: none;
		box-shadow: none;
		color: var(--color-text-reading);
	}
	textarea:hover:not(:disabled) {
		background: none;
	}
	/* Only the marks draw here; the words are the field's. */
	.export-marks {
		color: transparent;
		pointer-events: none;
		user-select: none;
	}
	.export-marks mark {
		background: none;
		color: transparent;
		text-decoration: underline wavy var(--color-warning);
		text-decoration-skip-ink: none;
		text-underline-offset: 0.2em;
	}
	.export-marks .export-mark--error {
		text-decoration-color: var(--color-danger);
	}
	.export-marks .export-mark--suggestion {
		text-decoration-color: var(--color-suggestion);
	}
	.export-marks .export-mark--manual-review {
		text-decoration: underline dotted var(--color-manual);
		text-decoration-thickness: 0.12em;
	}
	/* A mark with no finding of its own is only the open line's wash. */
	.export-marks .export-mark--place {
		text-decoration: none;
	}
	/* The open finding's line takes the caret line's wash, and its own words a
	   stronger one, so the place is found by shape before it is found by color. */
	.export-marks mark:is([data-line], [data-open]) {
		background: var(--color-fill-subtle);
		box-shadow: 0 0 0 var(--space-0-5) var(--color-fill-subtle);
	}
	.export-marks mark[data-open] {
		border-radius: var(--radius-xs);
		background: var(--color-accent-soft);
		box-shadow: 0 0 0 var(--space-0-5) var(--color-accent-soft);
	}
	textarea:focus-visible {
		outline-offset: calc(-1 * var(--focus-ring-width));
	}
	.export-error {
		display: flex;
		padding: var(--space-2) var(--space-5);
		gap: var(--space-2);
		align-items: center;
		color: var(--color-danger);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.export-error :global(svg) {
		flex: none;
	}
	/* The action band: the way back to the lyrics at the leading end, the two
	   outputs together at the trailing end, the contrast action last. */
	.export-actions {
		display: flex;
		padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
		background: var(--color-chrome);
	}
	.export-edit {
		margin-inline-end: auto;
		margin-inline-start: calc(-1 * var(--control-padding-inline));
	}
	.export-actions .button {
		white-space: nowrap;
	}
	.export-actions .button :global(svg) {
		flex: none;
	}
	.export-copy {
		min-width: calc(3 * var(--space-6));
	}
	@media (pointer: coarse) {
		.button,
		.icon-button {
			min-height: var(--control-height-touch);
		}
		.icon-button {
			min-width: var(--control-height-touch);
		}
	}
	/* One column once the rail would squeeze the lyrics: the output above, the
	   review below it at up to two fifths of the dialog. */
	@media (max-width: 52rem) {
		.export-body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(8rem, 1fr) minmax(0, auto);
		}
		.export-body > :global(.export-checks) {
			max-height: 40dvh;
			border-block-start: var(--border-width) solid var(--color-border);
			border-inline-start: 0;
		}
	}
	@media (max-width: 30rem) {
		.export-header,
		.export-actions {
			padding-inline: var(--space-4) var(--space-3);
		}
		textarea {
			padding-inline: var(--space-4);
		}
		.export-actions .button :global(svg) {
			display: none;
		}
	}
</style>
