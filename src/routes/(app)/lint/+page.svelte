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
	import BootScreen from '$lib/ui/layout/BootScreen.svelte';
	import {
		closeDatabase,
		createAutosaveController,
		createDraftRepository,
		createMediaRepository,
		createSessionIgnoreStore,
		createWorkspaceBackup,
		openDatabase,
		recoverStartupDraft,
		type LyricLintDatabase,
		type WorkspaceBackupController
	} from '$lib/persistence/index.js';
	import { currentRuleSet, sourceRegistry } from '$lib/rules/index.js';
	import DocumentTitle from '$lib/ui/layout/DocumentTitle.svelte';
	import TouchNotice from '$lib/ui/layout/TouchNotice.svelte';
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
	// The boot screen retires itself once the mark has landed and the workbench is
	// ready: it is what decides when the workspace is revealed, not this page.
	let revealed = $state(false);
	let database: LyricLintDatabase | undefined;
	let backup: WorkspaceBackupController | undefined;
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
				// `?slowboot` holds the workbench back so the boot screen's waiting
				// state — the mark landed, the waveform running — can be looked at on a
				// machine where local storage opens in forty milliseconds. Ten seconds
				// unless a number is given. `import.meta.env.DEV` is a build-time
				// constant, so none of this reaches a production bundle.
				if (import.meta.env.DEV) {
					const slowBoot = page.url.searchParams.get('slowboot');
					if (slowBoot !== null) {
						await new Promise((resolve) => setTimeout(resolve, Number(slowBoot) || 10_000));
						if (cancelled) return;
					}
				}

				database = await openDatabase();
				const ignoreStore = createSessionIgnoreStore(window.sessionStorage);
				backup = createWorkspaceBackup(database, { ignoreStore });
				const repository = createDraftRepository(database);
				const mediaRepository = createMediaRepository(database);
				const autosave = createAutosaveController(repository, {
					onStatusChange: (status: AutosaveStatus) => controller?.setSaveStatus(status)
				} as Parameters<typeof createAutosaveController>[1] & {
					onStatusChange: (status: AutosaveStatus) => void;
				});
				const initialDraft = await recoverStartupDraft(repository, mediaRepository);
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
					backup,
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
					onBackupRestored: () => location.reload(),
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
			void (async () => {
				await Promise.all([controller?.flushAutosave(), controller?.media?.flushPosition()]);
				await controller?.backup?.flush();
			})();
		};
		document.addEventListener('visibilitychange', flushWhenHidden);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', flushWhenHidden);
		};
	});

	onDestroy(() => {
		if (browser) backup?.destroy();
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

<!-- The workspace is mounted as soon as it exists and the boot screen covers it
     until the lockup has landed, so the reveal is a screen coming off something
     already drawn rather than a workbench assembling itself in front of the
     user. A boot failure is the one thing that outranks the sequence. -->
{#if controller}
	<Workspace {controller} editorComponent={EditorPane} brandRevealed={revealed} />
{:else if bootError}
	<p class="boot-message" role="alert">{bootError}</p>
{/if}

{#if !revealed && !bootError}
	<BootScreen ready={Boolean(controller)} ondone={() => (revealed = true)} />
{/if}

<!-- The touch notice waits for the boot screen, and a z-index could never have
     made it. A `<dialog>` opened with `showModal()` is in the browser's top
     layer, which sits above every stacking context on the page — so the boot
     screen cannot be lifted over it at any value, and the notice covered the
     landing it was mounted alongside.

     What it waits on is the same `revealed` the boot screen sets on its way out,
     so there is one answer to "is the boot screen gone" rather than two that can
     disagree. Mounting is the gate rather than a prop, because opening is what
     this surface does when it mounts.

     A boot failure never sets it, and that is right: the notice is a
     recommendation about the workbench, and there is no workbench behind an
     error to recommend anything about. Spending a session-scoped warning over a
     failure would also mean the user never sees it on the reload that works. -->
{#if revealed}
	<TouchNotice />
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
