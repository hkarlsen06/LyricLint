<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { onMount } from 'svelte';
	import AppWordmark from './AppWordmark.svelte';
	import DraftMenu from './DraftMenu.svelte';
	import LanguagePicker from './LanguagePicker.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	// Presentation-only clock for the "Saved locally · Ns ago" readout. It never
	// feeds back into the controller; it only re-renders the relative timestamp.
	let lastSavedAt = $state<number | undefined>();
	let clock = $state(Date.now());
	let previousStatus: string | undefined;

	$effect(() => {
		const status = controller.saveStatus;
		if (status === 'saved' && previousStatus !== 'saved') {
			lastSavedAt = Date.now();
		}
		previousStatus = status;
	});

	onMount(() => {
		const timer = setInterval(() => {
			clock = Date.now();
		}, 1000);
		return () => clearInterval(timer);
	});

	function relativeSaveTime(savedAt: number, now: number): string {
		const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
		if (seconds < 5) return 'just now';
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return `${Math.floor(minutes / 60)}h ago`;
	}

	const saveStatusText = $derived.by(() => {
		switch (controller.saveStatus) {
			case 'saved':
				return lastSavedAt === undefined
					? 'Saved locally'
					: `Saved locally · ${relativeSaveTime(lastSavedAt, clock)}`;
			case 'failed':
				return 'Save failed';
			case 'saving':
				return 'Saving…';
			case 'scheduled':
				return 'Save pending';
			default:
				return 'Local draft';
		}
	});

	// Fallback sizing for browsers without `field-sizing: content`; the CSS rule
	// takes over where it is supported and this attribute is ignored. Typing
	// writes the length locally; switching drafts resyncs it.
	let titleLength = $derived(controller.title.length);
	const titleSize = $derived(Math.min(28, Math.max(8, titleLength + 1)));

	// The title input lives outside a form, so Enter has no implicit submit to
	// piggyback on: commit explicitly and hand focus back. Tracking the committed
	// value keeps the blur-triggered `change` from renaming a second time.
	let committedTitle = $derived(controller.title);

	function commitTitle(input: HTMLInputElement) {
		if (input.value === committedTitle) return;
		committedTitle = input.value;
		controller.setTitle(input.value);
	}

	function onTitleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTitle(event.currentTarget);
			event.currentTarget.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.value = committedTitle;
			titleLength = committedTitle.length;
			event.currentTarget.blur();
		}
	}
</script>

<header class="document-toolbar" aria-label="Document controls">
	<!-- Left to right: who made this, what this document is called, and whether it
	     is safe on disk. The brand, the name, and the save state read as one
	     identity strip; everything that acts on the document lives on the right. -->
	<div class="document-toolbar__identity">
		<AppWordmark />
		<label class="sr-only" for="draft-title">Draft title</label>
		<input
			id="draft-title"
			class="draft-title"
			size={titleSize}
			value={controller.title}
			oninput={(event) => (titleLength = event.currentTarget.value.length)}
			onchange={(event) => commitTitle(event.currentTarget)}
			onkeydown={onTitleKeydown}
			aria-label="Draft title"
		/>
		<!-- Icon only while saving is going well: the disk glyph is the whole
		     readout, and the wording it replaced lives in the accessible name and
		     the hover tooltip. A failed save is the exception — it keeps its words
		     and swaps to an alert glyph, so the one state the user must act on is
		     never carried by red alone. -->
		<span
			class:failed={controller.saveStatus === 'failed'}
			class="save-status"
			role="img"
			aria-label="Autosave status: {saveStatusText}"
			title={saveStatusText}
		>
			{#if controller.saveStatus === 'failed'}
				<svg
					class="save-status__icon"
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M8 2.4 15 13.6H1Z" />
					<path d="M8 6.7v3M8 11.6h.01" />
				</svg>
				Save failed
			{:else}
				<svg
					class="save-status__icon"
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M12.8 13.5H3.2a.7.7 0 0 1-.7-.7V3.2a.7.7 0 0 1 .7-.7h7.3l2.7 2.7v7.6a.7.7 0 0 1-.7.7Z"
					/>
					<path d="M5 2.7v3h5.4v-3M5 13.3V9.5h6v3.8" />
				</svg>
			{/if}
		</span>
	</div>

	<!-- Copy anchors the right edge: it is the one action that ends the session's
	     work, so it sits last in reading order and last in the tab order. -->
	<div class="document-toolbar__commands">
		<LanguagePicker {controller} />
		<DraftMenu {controller} />
		<button
			type="button"
			class="button button--contrast"
			onclick={() => controller.copyCanonical()}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
				<path
					d="M10.5 3.5v-.8a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h.8"
				/>
			</svg>
			Copy lyrics
		</button>
	</div>
</header>
