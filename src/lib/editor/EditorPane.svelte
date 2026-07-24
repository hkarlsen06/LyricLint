<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Diagnostic,
		DiagnosticFix,
		EditorSnapshot,
		LanguagePack,
		TextRange
	} from '../core/types.js';
	import type { CreateLyricEditorOptions, LyricEditorInstance } from './create-editor.js';
	import type {
		EditorPaneProps,
		LyricEditorCallbacks,
		ScreenRect,
		SectionHeaderChoice,
		SelectionAnchor
	} from './contracts.js';
	import DiagnosticPopover from './overlays/DiagnosticPopover.svelte';
	import PerformerPicker from './overlays/PerformerPicker.svelte';
	import SectionPicker from './overlays/SectionPicker.svelte';

	let {
		initialText,
		initialSelection,
		context,
		callbacks,
		handle = $bindable(),
		onready,
		ondestroyed
	}: EditorPaneProps = $props();
	let host: HTMLDivElement;
	let editor = $state.raw<LyricEditorInstance | undefined>();
	let selectionAnchor = $state<SelectionAnchor | undefined>();
	let performerRange = $state<TextRange | undefined>();
	let sectionRange = $state<TextRange | undefined>();
	let activeDiagnostic = $state<Diagnostic | undefined>();
	let diagnosticTakesFocus = $state(false);
	let performerOpen = $state(false);
	let sectionOpen = $state(false);
	let dismissedSelection = $state<string | undefined>();
	let lastRevision = 0;

	const fallbackLanguagePack = $derived<LanguagePack>(
		context.languagePack ?? {
			tag: context.language,
			displayName: context.language,
			policy: 'unreviewed',
			headers: [],
			sourceIds: [],
			reviewed: false
		}
	);

	function rangeKey(range: TextRange): string {
		return `${range.from}:${range.to}`;
	}

	function rectForRange(range: TextRange): ScreenRect {
		const start = editor?.view.coordsAtPos(range.from, 1);
		const end = editor?.view.coordsAtPos(range.to, -1);
		const fallback = host.getBoundingClientRect();
		const left = Math.min(start?.left ?? fallback.left + 12, end?.left ?? fallback.left + 12);
		const top = Math.min(start?.top ?? fallback.top + 12, end?.top ?? fallback.top + 12);
		const right = Math.max(start?.right ?? left, end?.right ?? left);
		const bottom = Math.max(start?.bottom ?? top, end?.bottom ?? top);
		return {
			left,
			top,
			right,
			bottom,
			width: Math.max(0, right - left),
			height: Math.max(0, bottom - top)
		};
	}

	function activeAnchor(range: TextRange | undefined): ScreenRect | undefined {
		if (!range) {
			return undefined;
		}
		return selectionAnchor && rangeKey(selectionAnchor.range) === rangeKey(range)
			? selectionAnchor.rect
			: rectForRange(range);
	}

	function anchorPreference(range: TextRange): 'above' | 'below' {
		return selectionAnchor && rangeKey(selectionAnchor.range) === rangeKey(range)
			? selectionAnchor.prefer
			: 'above';
	}

	function openPerformerPicker(range: TextRange): void {
		performerRange = range;
		performerOpen = context.performers.length > 0;
		if (performerOpen) {
			sectionOpen = false;
			activeDiagnostic = undefined;
			diagnosticTakesFocus = false;
		}
	}

	function internalCallbacks(): LyricEditorCallbacks {
		return {
			...callbacks,
			onSnapshot(snapshot: EditorSnapshot) {
				if (snapshot.revision !== lastRevision) {
					lastRevision = snapshot.revision;
					dismissedSelection = undefined;
				}
				callbacks.onSnapshot(snapshot);
			},
			onAssignRequest(request) {
				openPerformerPicker(request.range);
				callbacks.onAssignRequest(request);
			},
			onSectionHeaderRequest(request) {
				sectionRange = request.range;
				sectionOpen = true;
				performerOpen = false;
				activeDiagnostic = undefined;
				diagnosticTakesFocus = false;
				callbacks.onSectionHeaderRequest(request);
			},
			onDiagnosticActivate(diagnostic) {
				activeDiagnostic = diagnostic;
				diagnosticTakesFocus = false;
				performerOpen = false;
				sectionOpen = false;
				callbacks.onDiagnosticActivate(diagnostic);
			},
			onDiagnosticActivateIntent(diagnostic) {
				activeDiagnostic = diagnostic;
				diagnosticTakesFocus = true;
				performerOpen = false;
				sectionOpen = false;
				callbacks.onDiagnosticActivate(diagnostic);
			},
			onDiagnosticDismiss() {
				if (!activeDiagnostic) {
					return false;
				}
				activeDiagnostic = undefined;
				diagnosticTakesFocus = false;
				return true;
			}
		};
	}

	function returnFocus(): void {
		editor?.handle.focus();
	}

	function cancelPerformer(): void {
		if (performerRange) {
			dismissedSelection = rangeKey(performerRange);
		}
		performerOpen = false;
	}

	async function applyPerformers(performerIds: string[]): Promise<void> {
		const range = performerRange;
		if (!range) {
			return;
		}
		try {
			const edit = await callbacks.createPerformerEdit?.({ range, performerIds });
			if (edit) {
				editor?.handle.dispatchAtomic(edit);
			}
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error ? error.message : 'The performer assignment could not be applied.'
			);
		}
		dismissedSelection = rangeKey(range);
		performerOpen = false;
	}

	function existingHeaders(): string[] {
		return (
			editor?.handle
				.getSnapshot()
				.parsed.sections.flatMap((section) =>
					section.header ? [section.header.rawNamePart] : []
				) ?? []
		);
	}

	async function chooseSection(choice: SectionHeaderChoice): Promise<void> {
		try {
			const edit = await callbacks.createSectionHeaderEdit?.(choice);
			if (edit) {
				editor?.handle.dispatchAtomic(edit);
			}
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error ? error.message : 'The section header could not be inserted.'
			);
		}
		sectionOpen = false;
	}

	function applyFix(fix: DiagnosticFix): void {
		if (!activeDiagnostic) {
			return;
		}
		if (callbacks.onApplyDiagnosticFix) {
			callbacks.onApplyDiagnosticFix(activeDiagnostic, fix);
		} else if (fix.kind === 'safe') {
			try {
				editor?.handle.dispatchAtomic(fix.edit);
			} catch (error) {
				callbacks.onAnnouncement(
					error instanceof Error ? error.message : 'The diagnostic fix could not be applied.'
				);
			}
		} else {
			callbacks.onAnnouncement('Preview fixes require the application review handler.');
		}
		activeDiagnostic = undefined;
		diagnosticTakesFocus = false;
		returnFocus();
	}

	function ignoreDiagnostic(): void {
		if (activeDiagnostic) {
			callbacks.onIgnoreDiagnostic?.(activeDiagnostic);
		}
		activeDiagnostic = undefined;
		diagnosticTakesFocus = false;
		returnFocus();
	}

	function suppressOverlaysDuringComposition(): void {
		performerOpen = false;
		sectionOpen = false;
		activeDiagnostic = undefined;
		diagnosticTakesFocus = false;
	}

	$effect(() => {
		editor?.updateContext(context);
	});

	$effect(() => {
		editor?.updateCallbacks(internalCallbacks());
	});

	onMount(() => {
		let cancelled = false;

		void (async () => {
			const { createLyricEditor } = await import('./create-editor.js');
			if (cancelled) {
				return;
			}
			const options: CreateLyricEditorOptions = {
				initialText,
				initialSelection,
				context,
				callbacks: internalCallbacks(),
				onSelectionAnchor(anchor) {
					selectionAnchor = anchor;
					if (!anchor) {
						performerOpen = false;
						return;
					}
					const key = rangeKey(anchor.range);
					if (
						anchor.userDriven &&
						context.performers.length > 0 &&
						key !== dismissedSelection &&
						(!performerRange || key !== rangeKey(performerRange) || !performerOpen)
					) {
						openPerformerPicker(anchor.range);
						callbacks.onAssignRequest({ range: anchor.range, prefer: anchor.prefer });
					}
				}
			};
			editor = createLyricEditor(host, options);
			handle = editor.handle;
			onready?.(handle);
		})();

		return () => {
			cancelled = true;
			editor?.destroy();
			editor = undefined;
			handle = undefined;
			ondestroyed?.();
		};
	});
</script>

<div
	class="editor-pane"
	class:reduced-motion={context.reducedMotion}
	bind:this={host}
	data-testid="lyric-editor"
	oncompositionstart={suppressOverlaysDuringComposition}
></div>

{#if performerOpen && performerRange}
	<PerformerPicker
		performers={context.performers}
		anchor={activeAnchor(performerRange)}
		placement={anchorPreference(performerRange)}
		onApply={applyPerformers}
		onCancel={cancelPerformer}
		{returnFocus}
		onManageRoster={() => {
			const range = performerRange;
			if (!range) {
				return;
			}
			callbacks.onAssignRequest({ range, prefer: anchorPreference(range) });
			callbacks.onAnnouncement('Performers panel opened to manage the roster.');
		}}
	/>
{/if}

{#if sectionOpen && sectionRange}
	<SectionPicker
		languagePack={fallbackLanguagePack}
		existingHeaders={existingHeaders()}
		range={sectionRange}
		anchor={activeAnchor(sectionRange)}
		onChoose={chooseSection}
		onCancel={() => (sectionOpen = false)}
		{returnFocus}
	/>
{/if}

{#if activeDiagnostic}
	<DiagnosticPopover
		diagnostic={activeDiagnostic}
		sources={context.sources}
		anchor={activeAnchor(activeDiagnostic)}
		documentText={editor?.handle.getSnapshot().text ?? initialText}
		takeFocus={diagnosticTakesFocus}
		onApplyFix={applyFix}
		onIgnore={ignoreDiagnostic}
		onDismiss={() => {
			activeDiagnostic = undefined;
			diagnosticTakesFocus = false;
			returnFocus();
		}}
	/>
{/if}

<style>
	.editor-pane {
		position: relative;
		height: 100%;
		min-height: 12rem;
		overflow: hidden;
		background: var(--color-surface, var(--ll-editor-surface, oklch(0.985 0.006 78)));
	}

	@media (prefers-reduced-motion: reduce) {
		.editor-pane,
		.editor-pane :global(*) {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	.reduced-motion,
	.reduced-motion :global(*) {
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}
</style>
