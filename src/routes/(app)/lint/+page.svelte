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
		createDraftIgnoreStore,
		createWorkspaceBackup,
		openDatabase,
		recoverStartupDraft,
		type LyricLintDatabase,
		type WorkspaceBackupController
	} from '$lib/persistence/index.js';
	import { currentRuleSet, sourceRegistry } from '$lib/rules/index.js';
	import DocumentTitle from '$lib/ui/layout/DocumentTitle.svelte';
	import TabBusyNotice from '$lib/ui/layout/TabBusyNotice.svelte';
	import Workspace from '$lib/ui/layout/Workspace.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import { guardWorkbenchTab, type TabGuard } from '$lib/ui/state/tab-guard.js';
	import { noticeTouchLayout } from '$lib/ui/state/touch-notice.js';
	import { ensurePersistentStorage } from '$lib/ui/state/storage-persistence.svelte.js';
	import {
		createWorkbenchController,
		type WorkbenchController
	} from '$lib/ui/state/workbench.svelte.js';
	import { rightPanelTabFromUrl, urlForRightPanelTab } from '$lib/ui/state/panel-url.js';
	import { onDestroy, onMount, untrack } from 'svelte';

	let controller = $state<WorkbenchController | undefined>();
	let bootError = $state<string | undefined>();
	// Another tab of this browser holds the workbench, so this one has not opened
	// local storage and is not going to until that tab goes away. It outranks the
	// boot screen, which would otherwise cover the notice for the whole wait.
	let tabBusy = $state(false);
	// The boot screen retires itself once the mark has landed and the workbench is
	// ready: it is what decides when the workspace is revealed, not this page.
	let revealed = $state(false);
	let database: LyricLintDatabase | undefined;
	let backup: WorkspaceBackupController | undefined;
	// Held for the life of this tab and given up in `onDestroy`, after the final
	// flush has landed and the database is closed — never in the mount cleanup,
	// which returns while that flush is still in flight.
	let guard: TabGuard | undefined;
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

		/**
		 * One workbench per browser profile, and this tab waits for it.
		 *
		 * It is taken here rather than in `Workspace` or the group layout for two
		 * reasons: this is the one place that opens the database, so the lock is
		 * held around exactly the work it protects; and every component test mounts
		 * the workspace directly, so none of them ever meets a lock manager.
		 *
		 * The boot is deferred rather than reloaded. Everything below already runs
		 * after an await and carries a `cancelled` flag, so waiting costs one more
		 * line — where a `location.reload()` on the way in would throw away the
		 * document the user is looking at to reach a state this page can simply
		 * enter.
		 */
		guard = guardWorkbenchTab({
			onWaiting: () => {
				if (!cancelled) tabBusy = true;
			}
		});
		const held = guard.held;

		// Resolve whether this origin's storage survives eviction, and take the
		// silent grant where the browser already reports one. Never shows UI —
		// the prompting path waits for the control in Preferences → Local data.
		void ensurePersistentStorage();

		void (async () => {
			try {
				// Nothing may touch local storage before this resolves. On the ordinary
				// path — no other tab — it is already resolved and costs a microtask.
				await held;
				if (cancelled) return;
				tabBusy = false;

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
				// Hydrated before the workbench exists to ask: the store's readers are
				// synchronous, so the one await this costs is spent here, at boot.
				const ignoreStore = await createDraftIgnoreStore(database);
				backup = createWorkspaceBackup(database, { ignoreStore });
				const repository = createDraftRepository(database);
				const mediaRepository = createMediaRepository(database);
				const autosave = createAutosaveController(repository, {
					onStatusChange: (status: AutosaveStatus) => controller?.setSaveStatus(status)
				});
				const initialDraft = await recoverStartupDraft(repository, mediaRepository);
				const initialRecentLanguages = await repository.getRecentLanguages();
				// `onDestroy` ran while the open was still in flight, so it found no
				// database to close and this continuation is the only thing that can:
				// a connection left open holds a `versionchange` another tab's upgrade
				// is waiting on, which reads as that tab hanging on boot rather than
				// as a page this one already left.
				if (cancelled) {
					closeDatabase(database);
					return;
				}

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
						// SAFETY: `URL.search` is empty or opens with `?`, and `URL.hash` is
						// empty or opens with `#` — so this is one of exactly the three route
						// shapes named here, which a template literal type cannot express.
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
					bootError = "Local storage is unavailable, so 'scribes cannot be saved in this browser.";
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

	// Leaving the page is the other last moment, and the only one the
	// `visibilitychange` flush above never sees: a client-side navigation — the
	// `About LyricLint` link in the status bar is one press away from the caret —
	// hides nothing and unloads nothing. Closing the database under the autosave's
	// own ~250ms debounce lost the last edit and left the deferred write to throw
	// against a closed connection, so the flush comes first and the close waits for
	// it. The failure is reported rather than swallowed by `finally`, which would
	// otherwise re-throw it as an unhandled rejection out of a destroyed component.
	//
	// The workbench lock is given up last, after that close, and that ordering is
	// the whole reason it is released here rather than in the mount cleanup: the
	// cleanup returns while this flush is still in flight, so a lock released
	// there would let the next tab boot and read a database this one is still
	// writing — which is the loss the guard exists to prevent, arrived at from
	// the teardown side.
	onDestroy(() => {
		if (!browser) return;
		backup?.destroy();
		void (controller?.flushAutosave() ?? Promise.resolve())
			.catch((error: Error) => console.error('The final autosave flush failed.', error))
			.finally(() => {
				if (database) closeDatabase(database);
				guard?.release();
			});
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
	<!-- Noindexed, so no search snippet reads this — but link previews and
	     auditors do, and without it the workbench is the one page saying nothing
	     about itself. The title stays DocumentTitle's: the tab is named after the
	     transcription, and that is the design rather than a gap. -->
	<meta
		name="description"
		content="Paste a Genius transcription, review every finding against the guideline that backs it, and copy clean markup. Everything stays in your browser."
	/>
</svelte:head>

<!-- The workspace is mounted as soon as it exists and the boot screen covers it
     until the lockup has landed, so the reveal is a screen coming off something
     already drawn rather than a workbench assembling itself in front of the
     user. A boot failure is the one thing that outranks the sequence. -->
{#if controller}
	<Workspace {controller} editorComponent={EditorPane} brandRevealed={revealed} />
{:else if bootError}
	<p class="boot-message" role="alert">{bootError}</p>
{:else if tabBusy}
	<TabBusyNotice />
{/if}

<!-- The touch notice is said as the boot screen leaves, and that hand-off is why
     it is spoken from here rather than from the group layout: `revealed` is this
     page's own state, and the boot screen's departure is the only moment that
     answers "is there a workbench to recommend anything about".

     It waits for two reasons now. The boot screen covers the whole window,
     toasts included (`--layer-boot` sits above `--layer-toast`), so a notice
     raised any earlier would spend its countdown behind it and be gone before
     anyone saw it. And a boot failure never sets `revealed`, so the notice never
     speaks over an error — which is right twice over: there is no workbench
     behind one, and spending a session-scoped message on a failed load means
     never seeing it on the reload that works.

     A tab waiting for another one is the third state that outranks the sequence,
     and for the same reason a boot failure is: the boot screen covers the whole
     window, so left mounted it would hide the notice for as long as the wait
     lasts — which is the one message that has to be read. It comes back the
     moment the lock arrives, because from there this is an ordinary boot. -->
{#if !revealed && !bootError && !tabBusy}
	<BootScreen
		ready={Boolean(controller)}
		ondone={() => {
			revealed = true;
			noticeTouchLayout(feedback);
		}}
	/>
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
