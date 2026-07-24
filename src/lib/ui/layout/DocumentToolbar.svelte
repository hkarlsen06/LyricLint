<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { onMount, tick } from 'svelte';
	import DraftMenu from './DraftMenu.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let customLanguage = $state('');

	const knownLanguages = [
		['en', 'English'],
		['en-US', 'English (United States)'],
		['en-GB', 'English (United Kingdom)'],
		['no', 'Norwegian'],
		['ar', 'Arabic'],
		['de', 'German'],
		['es', 'Spanish'],
		['fr', 'French'],
		['ja', 'Japanese'],
		['ko', 'Korean']
	] as const;

	const selectedLanguage = $derived(
		knownLanguages.some(([tag]) => tag === controller.language) ? controller.language : '__other__'
	);

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

	function onLanguageChange(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value !== '__other__') controller.setLanguage(value);
	}

	async function openPerformerPanel(): Promise<void> {
		controller.setPanelCollapsed(false);
		controller.setActiveTab('performers');
		await tick();
		document.getElementById('performers-panel-tab')?.focus();
		controller.feedback.announce(
			'Choose a performer in the Performers panel to assign the selection.'
		);
	}
</script>

<header class="document-toolbar" aria-label="Document controls">
	<div class="document-toolbar__identity">
		<span class="app-mark" aria-hidden="true">
			<svg
				viewBox="0 0 16 16"
				width="16"
				height="16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
			>
				<path d="M2.5 4h11M2.5 8h11M2.5 12h6.5" />
			</svg>
		</span>
		<label class="sr-only" for="draft-title">Draft title</label>
		<input
			id="draft-title"
			class="draft-title"
			value={controller.title}
			onchange={(event) => controller.setTitle(event.currentTarget.value)}
			aria-label="Draft title"
		/>
		<span
			class:failed={controller.saveStatus === 'failed'}
			class="save-status"
			aria-label="Autosave status"
		>
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
			{saveStatusText}
		</span>
		<div class="document-toolbar__meta">
			<label class="sr-only" for="draft-language">Lyric language</label>
			<select
				id="draft-language"
				class="language-select"
				value={selectedLanguage}
				onchange={onLanguageChange}
				aria-label="Lyric language"
			>
				{#each knownLanguages as [tag, label] (tag)}
					<option value={tag}>{label}</option>
				{/each}
				<option value="__other__">Other language…</option>
			</select>
			{#if selectedLanguage === '__other__'}
				<label class="sr-only" for="custom-language">BCP 47 language tag</label>
				<input
					id="custom-language"
					class="language-tag"
					placeholder={controller.language}
					bind:value={customLanguage}
					onchange={() => customLanguage.trim() && controller.setLanguage(customLanguage.trim())}
					aria-label="BCP 47 language tag"
				/>
			{/if}
			<DraftMenu {controller} />
		</div>
	</div>

	<div class="document-toolbar__commands" role="toolbar" aria-label="Editing commands">
		<button
			type="button"
			class="button button--primary button--pill"
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
			Copy Genius markup
		</button>
		<span class="document-toolbar__spacer" aria-hidden="true"></span>
		<button
			type="button"
			class="icon-button"
			disabled={!controller.snapshot.canUndo}
			aria-label="Undo document edit"
			title="Undo"
			onclick={() => controller.undo()}>↶</button
		>
		<button
			type="button"
			class="icon-button"
			disabled={!controller.snapshot.canRedo}
			aria-label="Redo document edit"
			title="Redo"
			onclick={() => controller.redo()}>↷</button
		>
		<span class="toolbar-separator" aria-hidden="true"></span>
		<button type="button" class="button button--quiet" onclick={() => controller.insertSection()}>
			Insert section
		</button>
		<button type="button" class="button button--quiet" onclick={openPerformerPanel}>
			Assign performer
		</button>
		<button
			type="button"
			class="icon-button"
			aria-label={controller.panelCollapsed ? 'Show right panel' : 'Hide right panel'}
			aria-expanded={!controller.panelCollapsed}
			onclick={() => controller.togglePanel()}
		>
			{controller.panelCollapsed ? '◧' : '▧'}
		</button>
	</div>
</header>
