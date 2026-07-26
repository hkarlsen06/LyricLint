<script lang="ts">
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { parseDocument } from '$lib/core/parser.js';
	import type {
		AutosaveStatus,
		DraftRecord,
		EditorHandle,
		EditorSnapshot
	} from '$lib/core/types.js';
	import EditorPane from '$lib/editor/EditorPane.svelte';
	import {
		closeDatabase,
		createAutosaveController,
		createDraftRepository,
		createMediaRepository,
		createSessionIgnoreStore,
		openDatabase,
		recoverStartupDraft,
		type LyricLintDatabase
	} from '$lib/persistence/index.js';
	import { currentRuleSet, sourceRegistry } from '$lib/rules/index.js';
	import DocumentTitle from '$lib/ui/layout/DocumentTitle.svelte';
	import Workspace from '$lib/ui/layout/Workspace.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import {
		createWorkbenchController,
		type WorkbenchController
	} from '$lib/ui/state/workbench.svelte.js';
	import { rightPanelTabFromUrl, urlForRightPanelTab } from '$lib/ui/state/panel-url.js';
	import { onDestroy, onMount, untrack } from 'svelte';

	let controller = $state<WorkbenchController | undefined>();
	let bootError = $state<string | undefined>();
	let database: LyricLintDatabase | undefined;
	const feedback = useFeedbackState();

	function snapshotFor(draft: DraftRecord, revision = 0): EditorSnapshot {
		return {
			revision,
			text: draft.text,
			selection: draft.editorSelection ?? { anchor: 0, head: 0 },
			parsed: parseDocument(draft.text),
			diagnostics: [],
			composing: false,
			canUndo: false,
			canRedo: false
		};
	}

	// The controller starts with a headless editor handle; the real CodeMirror
	// handle is published through `bind:handle` once EditorPane mounts.
	function headlessEditor(getSnapshot: () => EditorSnapshot): EditorHandle {
		return {
			focus() {},
			getSnapshot,
			dispatchAtomic() {},
			undo() {},
			redo() {},
			revealRange() {},
			setSelection() {}
		};
	}

	onMount(() => {
		let cancelled = false;

		void (async () => {
			try {
				database = await openDatabase();
				const repository = createDraftRepository(database);
				const mediaRepository = createMediaRepository(database);
				const autosave = createAutosaveController(repository, {
					onStatusChange: (status: AutosaveStatus) => controller?.setSaveStatus(status)
				} as Parameters<typeof createAutosaveController>[1] & {
					onStatusChange: (status: AutosaveStatus) => void;
				});
				const ignoreStore = createSessionIgnoreStore(window.sessionStorage);
				const initialDraft = await recoverStartupDraft(repository);
				const initialRecentLanguages = await repository.getRecentLanguages();
				if (cancelled) return;

				let snapshot = snapshotFor(initialDraft);
				const editor = headlessEditor(() => snapshot);

				controller = createWorkbenchController({
					editor,
					initialSnapshot: snapshot,
					initialDraft,
					initialRecentLanguages,
					repository,
					mediaRepository,
					autosave,
					ignoreStore,
					feedback,
					initialActiveTab: rightPanelTabFromUrl(page.url),
					onActiveTabChange: (tab) => {
						const next = urlForRightPanelTab(page.url, tab);
						const target = `/lint/${next.search}${next.hash}` as
							'/lint/' | `/lint/?${string}` | `/lint/#${string}`;
						replaceState(resolve(target), page.state);
					},
					sources: [...sourceRegistry.values()],
					ruleSet: currentRuleSet,
					onOpenDraft: (draft) => {
						snapshot = snapshotFor(draft, 0);
						return snapshot;
					}
				});
			} catch (error) {
				if (!cancelled) {
					bootError = 'Local storage is unavailable, so drafts cannot be saved in this browser.';
					console.error('LyricLint failed to open local storage.', error);
				}
			}
		})();

		// Hiding the tab is the last moment either of these is reachable, and a
		// reload or a close arrives here first. The playhead flushes alongside the
		// text for the same reason the text flushes at all.
		const flushWhenHidden = () => {
			if (document.visibilityState !== 'hidden') return;
			void controller?.flushAutosave();
			void controller?.media?.flushPosition();
		};
		document.addEventListener('visibilitychange', flushWhenHidden);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', flushWhenHidden);
		};
	});

	onDestroy(() => {
		if (browser && database) closeDatabase(database);
	});

	// A history traversal or an externally changed URL must update the already
	// mounted workbench too. The controller's callback is a no-op for the URL in
	// this direction because it already names the selected tab.
	$effect(() => {
		const tab = rightPanelTabFromUrl(page.url);
		const currentController = controller;
		untrack(() => currentController?.setActiveTab(tab));
	});
</script>

<!-- Keep the active draft first so it remains visible when a browser tab is narrow. -->
<DocumentTitle title={controller?.title} />

<svelte:head>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

{#if controller}
	<Workspace {controller} editorComponent={EditorPane} />
{:else if bootError}
	<p class="boot-message" role="alert">{bootError}</p>
{:else}
	<p class="boot-message" aria-live="polite">Loading your workspace…</p>
{/if}

<style>
	.boot-message {
		margin: 4rem auto;
		max-width: 32rem;
		text-align: center;
		color: var(--color-text-muted);
		font: inherit;
	}
</style>
