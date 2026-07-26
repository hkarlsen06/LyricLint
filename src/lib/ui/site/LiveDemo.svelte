<script lang="ts">
	// The landing page's demo is the product, not a picture of it.
	//
	// This mounts the same `EditorPane` the workbench mounts, running the same
	// rule set through the same wiring, so the underlines, the hovered popover,
	// the citation and its tooltip, and the fix diff are not reproductions —
	// they are the components themselves. A screenshot would go stale the first
	// time a severity color or a card's shape changed; this cannot.
	//
	// What it deliberately does not have is the shell around the editor: no
	// toolbar, no linter panel, no drafts, and no persistence. Nothing here
	// touches IndexedDB, so reading the landing page never creates a draft and
	// never disturbs one the reader already has open in another tab.
	import { onDestroy, untrack } from 'svelte';
	import { parseDocument } from '$lib/core/parser.js';
	import type {
		Diagnostic,
		DiagnosticFix,
		EditorHandle,
		EditorSnapshot,
		PerformerRecord
	} from '$lib/core/types.js';
	import {
		EditorPane,
		type EditorDisplayContext,
		type LyricEditorCallbacks
	} from '$lib/editor/index.js';
	import { getLanguagePack, resolveLanguageTag } from '$lib/languages/registry.js';
	import {
		allocatePerformerColor,
		assignVoiceGroup,
		assignVoiceLegend,
		insertSectionHeader,
		normalizePerformerKey
	} from '$lib/performers/index.js';
	import {
		collectMatchingFixes,
		createHarperDiagnosticProvider,
		currentRuleSet,
		mergeFixes,
		mergeHarperDiagnostics,
		type HarperDiagnosticProvider,
		sourceRegistry
	} from '$lib/rules/index.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';

	let {
		text,
		language = 'en',
		performerNames = [],
		harperProvider = createHarperDiagnosticProvider()
	}: {
		text: string;
		language?: string;
		performerNames?: readonly string[];
		/** Injectable so component tests can avoid instantiating the WASM worker. */
		harperProvider?: HarperDiagnosticProvider;
	} = $props();

	/**
	 * Build the roster the way the roster store does, one name at a time, so the
	 * colors the demo shows are the colors the workbench would pick for the same
	 * two names. `allocatePerformerColor` balances usage across the palette and
	 * reads the roster built so far, so the accumulator has to be threaded
	 * through rather than mapped over.
	 */
	function makeRoster(names: readonly string[]): PerformerRecord[] {
		const roster: PerformerRecord[] = [];
		for (const displayName of names) {
			roster.push({
				id: `demo-performer-${roster.length + 1}`,
				displayName,
				normalizedKey: normalizePerformerKey(displayName),
				aliases: [],
				colorId: allocatePerformerColor(displayName, roster),
				order: roster.length
			});
		}
		return roster;
	}

	// A roster with names already in it, because performer tagging is the feature
	// this demo most needs to be able to show and it is unreachable from an empty
	// one: the assignment card's whole job is to offer performers to assign, and
	// with none to offer a reader who selects a line meets a control that can only
	// tell them to go and create something first.
	//
	// `performerNames` seeds this once and then stops mattering — the roster is
	// local state from here, and a reader who adds or renames a performer owns it.
	// `untrack` is what says so: re-deriving from the prop would silently discard
	// their edit every time the prop's identity changed.
	let performers = $state<PerformerRecord[]>(untrack(() => makeRoster(performerNames)));

	// Read off the roster rather than written into the copy beneath the editor,
	// so renaming a demo performer cannot leave the sentence naming someone who
	// is no longer in it.
	const performerList = $derived(
		new Intl.ListFormat('en', { style: 'long', type: 'disjunction' }).format(
			performers.map((performer) => performer.displayName)
		)
	);

	const reducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let harperTimer: ReturnType<typeof setTimeout> | undefined;
	let harperRequest = 0;
	let harperUnavailable = false;
	const harperDelay = 250;

	function invalidateHarper(): number {
		harperRequest += 1;
		if (harperTimer !== undefined) {
			clearTimeout(harperTimer);
			harperTimer = undefined;
		}
		return harperRequest;
	}

	function scheduleHarper(next: EditorSnapshot, nativeDiagnostics: readonly Diagnostic[]): void {
		const request = invalidateHarper();
		if (
			harperUnavailable ||
			resolveLanguageTag(language) !== 'en' ||
			next.text.trim().length === 0
		) {
			return;
		}

		const performersAtRequest = [...performers];
		harperTimer = setTimeout(() => {
			harperTimer = undefined;
			void harperProvider
				.lint({
					text: next.text,
					document: next.parsed,
					language,
					performers: performersAtRequest,
					revision: next.revision
				})
				.then((harperDiagnostics) => {
					if (
						request !== harperRequest ||
						snapshot.composing ||
						snapshot.revision !== next.revision ||
						snapshot.text !== next.text
					) {
						return;
					}

					const merged = mergeHarperDiagnostics(nativeDiagnostics, harperDiagnostics);
					if (merged.length === nativeDiagnostics.length) return;
					lastDiagnostics = merged;
					snapshot = { ...snapshot, diagnostics: merged };
				})
				.catch((error: unknown) => {
					if (request !== harperRequest || harperUnavailable) return;
					harperUnavailable = true;
					console.error('Harper grammar checking is unavailable in the landing demo.', error);
				});
		}, harperDelay);
	}

	function enrich(snapshot: EditorSnapshot): EditorSnapshot {
		// Composition revisions reuse whatever was last computed, exactly as the
		// workbench does: linting half-finished IME input reports on text the
		// user has not typed yet.
		if (snapshot.composing) {
			invalidateHarper();
			return { ...snapshot, diagnostics: lastDiagnostics };
		}
		lastDiagnostics = computeDiagnostics(
			snapshot.parsed,
			buildRuleContext(language, performers, currentRuleSet.version, snapshot.revision)
		);
		scheduleHarper(snapshot, lastDiagnostics);
		return { ...snapshot, diagnostics: lastDiagnostics };
	}

	function initialSnapshot(): EditorSnapshot {
		const parsed = parseDocument(text);
		return {
			revision: 0,
			text,
			selection: { anchor: 0, head: 0 },
			parsed,
			diagnostics: [],
			composing: false,
			canUndo: false,
			canRedo: false
		};
	}

	let lastDiagnostics: Diagnostic[] = [];
	// Seeded rather than left empty: the pane paints its first frame from this,
	// and an editor that arrives clean and sprouts underlines a tick later reads
	// as a page still loading rather than as a linter that has already run.
	let snapshot = $state<EditorSnapshot>(enrich(initialSnapshot()));
	let handle = $state<EditorHandle>();
	// The static sample below is the prerendered text, and it is what a crawler
	// and a reader with no JavaScript get. CodeMirror only exists after mount, so
	// the fallback stands in until the real pane is ready and then stands down —
	// leaving both in the document would show the verse twice.
	let editorReady = $state(false);

	onDestroy(() => {
		invalidateHarper();
		void harperProvider
			.dispose()
			.catch((error: unknown) => console.error('Harper demo worker cleanup failed.', error));
	});

	const context = $derived<EditorDisplayContext>({
		language,
		performers,
		ruleSetVersion: currentRuleSet.version,
		parsed: snapshot.parsed,
		diagnostics: { revision: snapshot.revision, items: snapshot.diagnostics },
		voiceGroups: resolveVoiceGroupRanges(snapshot.parsed, performers),
		languagePack: getLanguagePack(language),
		reducedMotion,
		sources: [...sourceRegistry.values()]
	});

	function applyEdit(fix: DiagnosticFix): void {
		handle?.dispatchAtomic(fix.edit);
	}

	const callbacks: LyricEditorCallbacks = {
		onSnapshot: (next) => (snapshot = enrich(next)),
		// These two are no-ops in the workbench too: the pickers they used to open
		// are anchored inside the pane and drive themselves.
		onAssignRequest: () => {},
		onSectionHeaderRequest: () => {},
		// Navigation and announcements belong to the shell, which is not here. The
		// popover is anchored under its own underline, so there is nothing to
		// travel to and no live region to speak into.
		onDiagnosticActivate: () => {},
		onAnnouncement: () => {},
		// The ghost row is off in this pane (see `sectionGhosts` below), but the
		// keyboard path to the picker is not, and a control that does nothing when
		// pressed is worse than a screenshot. It stays wired.
		createSectionHeaderEdit: ({ range, headerName, ordinal, numberedHeaderTerms }) => {
			const result = insertSectionHeader({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom: range.from,
				headerName,
				ordinal,
				numberedHeaderTerms
			});
			return result.status === 'applied' ? result.edit : undefined;
		},
		// Performer tagging, wired for real. This is the feature the demo exists to
		// let someone stumble into, and all three of these are on the path: the
		// card assigns a selection, the header legend assigns a whole section, and
		// a name typed into the card has to reach the roster or the performer it
		// created has no color and no identity.
		createPerformerEdit: ({ range, performerIds, sectionPerformerIds }) => {
			const result = assignVoiceGroup({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to },
				performerIds: [...performerIds],
				sectionPerformerIds,
				roster: performers
			});
			return result.status === 'applied' ? result.edit : undefined;
		},
		createPerformerLegendEdit: ({ sectionFrom, assignments, unwrapSlots }) => {
			const result = assignVoiceLegend({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom,
				assignments: assignments.map((assignment) => ({
					...assignment,
					performerIds: [...assignment.performerIds]
				})),
				roster: performers,
				unwrapSlots
			});
			return result.status === 'applied' ? result.edit : undefined;
		},
		onAddPerformer: (displayName) => {
			const trimmed = displayName.trim();
			if (!trimmed) return;
			performers = [
				...performers,
				{
					id: `demo-performer-${performers.length + 1}`,
					displayName: trimmed,
					normalizedKey: normalizePerformerKey(trimmed),
					aliases: [],
					colorId: allocatePerformerColor(trimmed, performers),
					order: performers.length
				}
			];
		},
		// The document edit is already applied and owns undo; the roster only has
		// to follow the name so the color stays attached to the same voice.
		onPerformerRenamed: ({ performerId, displayName }) => {
			performers = performers.map((performer) =>
				performer.id === performerId
					? { ...performer, displayName, normalizedKey: normalizePerformerKey(displayName) }
					: performer
			);
		},
		onApplyDiagnosticFix: (_diagnostic, fix) => applyEdit(fix),
		// The real planner, over this pane's own diagnostics. There is no severity
		// filter and no ignore list on this surface, so every finding is visible
		// and the count the button shows is the count it will change.
		countDiagnosticFixBatch: (diagnostic, fix) =>
			collectMatchingFixes(snapshot.diagnostics, diagnostic, fix).length,
		onApplyDiagnosticFixBatch: (diagnostic, fix) => {
			const fixes = collectMatchingFixes(snapshot.diagnostics, diagnostic, fix);
			// The batch can collapse to the fix it started from when a re-lint
			// removes its siblings between the render and the press, and `mergeFixes`
			// declines outright if the fixes no longer share a base revision. Both
			// end the same way: apply the one the user actually pressed.
			const merged = fixes.length > 1 ? mergeFixes(fixes) : undefined;
			if (merged) handle?.dispatchAtomic(merged);
			else applyEdit(fix);
		},
		onIgnoreDiagnostic: () => {},
		onSetLanguage: () => {}
	};
</script>

<div class="site-demo">
	<div class="site-demo__editor">
		{#if !editorReady}
			<pre class="site-demo__fallback">{text}</pre>
		{/if}
		<!-- No `+ Add section header` row. In the workbench it costs one row of a
		     document the reader can scroll; here the editor is a fixed box a few
		     lines tall and the row was a quarter of it, above the verse it was
		     meant to introduce. The sample loses nothing by it: what is wrong with
		     its header is `section.header-prose`, and that fix rewrites the line
		     itself, on the line, where the reader is already looking. -->
		<EditorPane
			initialText={text}
			initialSelection={{ anchor: 0, head: 0 }}
			initialRevision={0}
			{context}
			{callbacks}
			bind:handle
			sectionGhosts={false}
			autoHeight
			onready={() => (editorReady = true)}
		/>
	</div>
	<!-- The `{#if}` sits on its own line rather than hard against the sentence
	     before it. Svelte trims the whitespace just inside a block's opening tag,
	     so `offers.{#if …}` followed by an indented line ran the two sentences
	     together; whitespace *outside* the tag survives as the space they need. -->
	<p class="site-demo__hint">
		Hover over an underline to see the finding, the relevant Genius guideline, and the suggested
		fix.
		{#if performers.length > 0}
			Select a line to credit it to {performerList}.
		{/if}
		Edit directly to see what else the editor catches.
	</p>
</div>
