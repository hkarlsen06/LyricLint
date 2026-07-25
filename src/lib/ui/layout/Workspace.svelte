<script lang="ts">
	import type { EditorHandle, EditorSnapshot } from '$lib/core/types.js';
	import type {
		EditorDisplayContext,
		EditorPaneProps,
		LyricEditorCallbacks
	} from '$lib/editor/index.js';
	import {
		assignVoiceGroup,
		assignVoiceLegend,
		insertSectionHeader
	} from '$lib/performers/index.js';
	import { getLanguagePack } from '$lib/languages/registry.js';
	import { type Component, untrack } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';
	import DocumentToolbar from './DocumentToolbar.svelte';
	import MockEditorPane from './MockEditorPane.svelte';
	import RightPanel from './RightPanel.svelte';

	let {
		controller,
		editorComponent = MockEditorPane
	}: {
		controller: WorkbenchController;
		editorComponent?: Component<EditorPaneProps>;
	} = $props();

	let editorHandle = $state<EditorHandle>(untrack(() => controller.editor));
	const EditorComponent = $derived(editorComponent);

	const reducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const isMacLike =
		typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform ?? '');
	const fixShortcut = isMacLike ? '⌘.' : 'Ctrl+.';

	// Local on purpose: the codebase has no shared pluralizer, and the status
	// bar is UI chrome (always English), not lyric text, so the language packs
	// under $lib/languages do not apply.
	function count(value: number, noun: string): string {
		return `${value} ${noun}${value === 1 ? '' : 's'}`;
	}

	// Read-only presentation stats for the status bar; derived from the snapshot
	// the controller already holds, never written back.
	const documentStats = $derived.by(() => {
		const parsed = controller.snapshot.parsed;
		const lines = parsed.sections.reduce((total, section) => total + section.lines.length, 0);
		const voiceGroups = new Set(
			parsed.sections.flatMap((section) => section.voiceGroups.map((group) => group.id))
		).size;
		return {
			lines,
			sections: parsed.sections.length,
			performers: controller.performers.length,
			voiceGroups
		};
	});

	// Run the rule engine for one revision and fold the diagnostics into the
	// snapshot before the controller stores it. Composition revisions reuse the
	// previous result so linting never runs on incomplete IME input.
	let lastDiagnostics: EditorSnapshot['diagnostics'] = [];
	let lastLintKey = '';

	function lintKey(snapshot: EditorSnapshot): string {
		const performerKey = controller.performers
			.map(
				(performer) =>
					`${performer.id}:${performer.normalizedKey}:${performer.aliases.join('\u001f')}`
			)
			.join('\u001e');
		return `${controller.language}\u0000${performerKey}\u0000${snapshot.revision}\u0000${snapshot.text}`;
	}

	function enrichSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
		if (!snapshot.composing) {
			const context = buildRuleContext(
				controller.language,
				controller.performers,
				controller.ruleSet?.version ?? 'unavailable',
				snapshot.revision
			);
			lastDiagnostics = computeDiagnostics(snapshot.parsed, context);
			lastLintKey = lintKey(snapshot);
		}
		return { ...snapshot, diagnostics: lastDiagnostics };
	}

	const editorContext = $derived<EditorDisplayContext>({
		language: controller.language,
		performers: controller.performers,
		ruleSetVersion: controller.ruleSet?.version ?? 'unavailable',
		parsed: controller.snapshot.parsed,
		diagnostics: {
			revision: controller.snapshot.revision,
			items: controller.snapshot.diagnostics.filter(
				(diagnostic) => !controller.ignoredRuleIds.includes(diagnostic.ruleId)
			)
		},
		voiceGroups: resolveVoiceGroupRanges(controller.snapshot.parsed, controller.performers),
		languagePack: getLanguagePack(controller.language),
		reducedMotion,
		sources: [...controller.sources.values()]
	});

	const editorCallbacks: LyricEditorCallbacks = {
		onSnapshot: (snapshot) => controller.onSnapshot(enrichSnapshot(snapshot)),
		// Assignment happens inline in the floating card; the right panel keeps
		// whatever tab the user chose.
		onAssignRequest: () => {},
		onAddPerformer: (displayName) => controller.addPerformer(displayName),
		onPerformerRenamed: ({ performerId, previousName, displayName }) =>
			controller.adoptHeaderRename(performerId, previousName, displayName),
		onSectionHeaderRequest: () => {},
		// Keyboard diagnostic navigation travels to the diagnostic; hovering one in
		// the editor only marks its card, leaving the text under the pointer still.
		onDiagnosticActivate: (diagnostic) => controller.navigateToDiagnostic(diagnostic),
		onDiagnosticHighlight: (diagnostic) => controller.highlightDiagnostic(diagnostic),
		onAnnouncement: (message) => controller.feedback.announce(message),
		createPerformerEdit: ({ range, performerIds }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceGroup({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to },
				performerIds: [...performerIds],
				roster: controller.performers
			});
			if (result.status === 'applied') return result.edit;
			const reason = (result.blocked ?? result.reason).replaceAll('-', ' ');
			controller.feedback.announce(`Performer assignment blocked: ${reason}.`);
			return undefined;
		},
		createPerformerLegendEdit: ({ sectionFrom, assignments, unwrapSlots }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceLegend({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom,
				assignments: assignments.map((assignment) => ({
					...assignment,
					performerIds: [...assignment.performerIds]
				})),
				roster: controller.performers,
				unwrapSlots
			});
			if (result.status === 'applied') return result.edit;
			controller.feedback.announce('Those section performers could not be assigned.');
			return undefined;
		},
		createSectionHeaderEdit: ({ range, headerName, ordinal, numberedHeaderTerms }) => {
			const snapshot = controller.snapshot;
			const result = insertSectionHeader({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom: range.from,
				headerName,
				ordinal,
				numberedHeaderTerms
			});
			if (result.status === 'applied') return result.edit;
			controller.feedback.announce('That section header could not be inserted here.');
			return undefined;
		},
		onApplyDiagnosticFix: (diagnostic, fix) => controller.applyFix(diagnostic, fix),
		onIgnoreDiagnostic: (diagnostic) => controller.ignoreRule(diagnostic.ruleId),
		onSetLanguage: (language) => controller.setLanguage(language)
	};

	$effect(() => {
		controller.setEditorHandle(editorHandle);
	});

	// Language and roster changes do not create a CodeMirror transaction. Re-run
	// the rules against the current immutable document so the selector updates
	// diagnostics immediately instead of waiting for the next keystroke.
	$effect(() => {
		const current = controller.snapshot;
		const key = lintKey(current);
		if (current.composing || key === lastLintKey) return;
		controller.onSnapshot(enrichSnapshot(current));
	});
</script>

<main class="workspace" data-testid="workspace">
	<!-- The toolbar spans both columns: the draft's name, its save state, and the
	     commands that act on the whole document belong to the window, not to the
	     editor half of it. The panel's tabs then hang directly under it. -->
	<DocumentToolbar {controller} />

	<section class="editor-region" aria-label="Lyrics workspace">
		<div class="editor-host" data-testid="editor-region">
			{#key controller.draftId}
				<EditorComponent
					initialText={controller.snapshot.text}
					initialSelection={controller.snapshot.selection}
					initialRevision={controller.snapshot.revision}
					context={editorContext}
					callbacks={editorCallbacks}
					bind:handle={editorHandle}
				/>
			{/key}
		</div>
	</section>

	<RightPanel {controller} />

	<footer class="status-bar" aria-label="Document summary">
		<span class="status-bar__group">
			<span>{count(documentStats.lines, 'line')} · {count(documentStats.sections, 'section')}</span>
			<span
				>{count(documentStats.performers, 'performer')} · {count(
					documentStats.voiceGroups,
					'voice group'
				)}</span
			>
		</span>
		<span class="status-bar__group status-bar__hints">
			<span><kbd>F8</kbd> next issue</span>
			<span><kbd>{fixShortcut}</kbd> fixes</span>
			<span>offline ready</span>
		</span>
	</footer>
</main>
