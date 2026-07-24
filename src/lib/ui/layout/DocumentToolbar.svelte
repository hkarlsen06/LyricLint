<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
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

	function onLanguageChange(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value !== '__other__') controller.setLanguage(value);
	}

	function openPerformerPanel(): void {
		controller.setPanelCollapsed(false);
		controller.setActiveTab('performers');
		controller.feedback.announce(
			'Choose a performer in the Performers panel to assign the selection.'
		);
	}
</script>

<header class="document-toolbar" aria-label="Document controls">
	<div class="document-toolbar__identity">
		<DraftMenu {controller} />
		<label class="sr-only" for="draft-title">Draft title</label>
		<input
			id="draft-title"
			class="draft-title"
			value={controller.title}
			onchange={(event) => controller.setTitle(event.currentTarget.value)}
			aria-label="Draft title"
		/>
		<label class="sr-only" for="draft-language">Lyric language</label>
		<select
			id="draft-language"
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
		<span
			class:failed={controller.saveStatus === 'failed'}
			class="save-status"
			aria-label="Autosave status"
		>
			{controller.saveStatus === 'saved'
				? 'Saved locally'
				: controller.saveStatus === 'failed'
					? 'Save failed'
					: controller.saveStatus === 'saving'
						? 'Saving…'
						: controller.saveStatus === 'scheduled'
							? 'Save pending'
							: 'Local draft'}
		</span>
	</div>

	<div class="document-toolbar__commands" role="toolbar" aria-label="Editing commands">
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
		<button type="button" class="button button--primary" onclick={() => controller.copyCanonical()}>
			Copy Genius markup
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
