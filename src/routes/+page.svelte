<script lang="ts">
	import { browser } from '$app/environment';
	import { parseDocument } from '$lib/core/parser.js';
	import type {
		DraftRecord,
		EditorHandle,
		EditorSnapshot,
		SessionIgnoreStore
	} from '$lib/core/types.js';
	import Workspace from '$lib/ui/layout/Workspace.svelte';
	import {
		createContractSessionIgnoreStore,
		createInMemoryAutosaveController,
		createInMemoryDraftRepository,
		createMemorySessionStorage
	} from '$lib/ui/state/in-memory.js';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import { createWorkbenchController } from '$lib/ui/state/workbench.svelte.js';
	import { onMount } from 'svelte';

	const initialDraft: DraftRecord = {
		id: 'local-draft',
		title: 'Untitled draft',
		text: '',
		language: 'en',
		performers: [],
		createdAt: '1970-01-01T00:00:00.000Z',
		updatedAt: '1970-01-01T00:00:00.000Z',
		ruleSetVersion: 'unavailable',
		editorSelection: { anchor: 0, head: 0 }
	};

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

	let headlessSnapshot = snapshotFor(initialDraft);
	const headlessEditor: EditorHandle = {
		focus() {},
		getSnapshot: () => headlessSnapshot,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection(selection) {
			headlessSnapshot = { ...headlessSnapshot, selection };
		}
	};

	const feedback = useFeedbackState();
	const repository = createInMemoryDraftRepository([initialDraft]);
	const autosave = createInMemoryAutosaveController(repository);
	const sessionStorageAdapter = browser
		? {
				get length() {
					try {
						return window.sessionStorage.length;
					} catch {
						return 0;
					}
				},
				key(index: number) {
					try {
						return window.sessionStorage.key(index);
					} catch {
						return null;
					}
				},
				getItem(key: string) {
					try {
						return window.sessionStorage.getItem(key);
					} catch {
						return null;
					}
				},
				setItem(key: string, value: string) {
					try {
						window.sessionStorage.setItem(key, value);
					} catch {
						feedback.announce('Session ignore state is unavailable in this browser.');
					}
				},
				removeItem(key: string) {
					try {
						window.sessionStorage.removeItem(key);
					} catch {
						feedback.announce('Session ignore state could not be cleared.');
					}
				}
			}
		: createMemorySessionStorage();
	const ignoreStore: SessionIgnoreStore = createContractSessionIgnoreStore(sessionStorageAdapter);
	const controller = createWorkbenchController({
		editor: headlessEditor,
		initialSnapshot: headlessSnapshot,
		initialDraft,
		repository,
		autosave,
		ignoreStore,
		feedback,
		onOpenDraft(draft) {
			const nextSnapshot = snapshotFor(draft, headlessSnapshot.revision + 1);
			headlessSnapshot = nextSnapshot;
			return nextSnapshot;
		}
	});

	onMount(() => {
		const flushWhenHidden = () => {
			if (document.visibilityState === 'hidden') void controller.flushAutosave();
		};
		document.addEventListener('visibilitychange', flushWhenHidden);
		return () => document.removeEventListener('visibilitychange', flushWhenHidden);
	});
</script>

<Workspace {controller} />
