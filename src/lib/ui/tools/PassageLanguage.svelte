<script lang="ts">
	import {
		selectedContentRanges,
		projectOffset,
		renderProfile,
		resolveDecision,
		importDocument
	} from '#lib/conversion/index.js';
	import { languageName } from '#lib/languages/options.js';
	import LanguagePicker from '../layout/LanguagePicker.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let {
		controller,
		controlsOnly = false,
		contextual = false
	}: { controller: WorkbenchController; controlsOnly?: boolean; contextual?: boolean } = $props();
	const selection = $derived(controller.snapshot.selection);
	const range = $derived({
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head)
	});
	const scope = $derived(
		JSON.stringify([
			controller.draftId,
			controller.profile,
			controller.profileSession,
			controller.snapshot.revision,
			controller.snapshot.text,
			selection
		])
	);
	let captured = $state<{ scope: string; range: typeof range; text: string }>();
	let stale = $state(false);
	let message = $state('');
	$effect(() => {
		if (captured && scope !== captured.scope) stale = true;
	});
	const enabled = $derived(
		!controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery
	);
	const model = $derived(controller.snapshot.conversion?.model);
	const selectionLanguages = $derived.by(() => {
		const conversion = controller.snapshot.conversion;
		if (!conversion || range.from === range.to) return [controller.language];
		const projection = renderProfile(conversion.model, conversion.profile);
		if (!projection.ok) return [];
		const ranges = selectedContentRanges(projection.value, range);
		if (ranges.length === 0) return [controller.language];
		const languages: string[] = [];
		const overrides = [...conversion.model.languageRanges].sort((a, b) => a.from - b.from);
		let first = 0;
		for (const range of ranges) {
			while (first < overrides.length && overrides[first]!.to <= range.from) first++;
			let at = range.from;
			for (
				let index = first;
				index < overrides.length && overrides[index]!.from < range.to;
				index++
			) {
				const entry = overrides[index]!;
				const start = Math.max(range.from, entry.from);
				const end = Math.min(range.to, entry.to);
				if (at < start) languages.push(conversion.model.defaultLanguage);
				languages.push(entry.language);
				at = end;
			}
			if (at < range.to) languages.push(conversion.model.defaultLanguage);
		}
		return [...new Set(languages)];
	});
	const eligible = $derived.by(() => {
		const conversion = controller.snapshot.conversion;
		if (!enabled || controller.snapshot.composing || range.from === range.to) return false;
		// Ordinary Genius writing imports lazily on the first semantic action.
		const imported = conversion
			? { ok: true as const, value: conversion.model }
			: importDocument({
					text: controller.snapshot.text,
					profile: controller.profile,
					language: controller.language,
					performers: controller.performers
				});
		if (!imported.ok) return false;
		const projection = renderProfile(imported.value, controller.profile);
		return (
			projection.ok &&
			resolveDecision(imported.value, projection.value, {
				kind: 'setPassageLanguage',
				range,
				language: controller.language
			}).ok
		);
	});
	const language = $derived(selectionLanguages.length === 1 ? selectionLanguages[0] : undefined);
	function show(from: number, to: number) {
		const conversion = controller.snapshot.conversion;
		if (!conversion) return;
		const projection = renderProfile(conversion.model, conversion.profile);
		if (!projection.ok) return;
		controller.showConversionPassage({
			from: projectOffset(projection.value, from, 1),
			to: projectOffset(projection.value, to, -1)
		});
	}

	const refusal =
		'The lyrics, selection or document changed. Close and reopen passage language for the current selection.';
	function choose(language: string): boolean {
		if (!captured || stale || captured.scope !== scope) {
			message = refusal;
			controller.feedback.announce(message);
			return false;
		}
		const applied = controller.applyConversionAction({
			kind: 'setPassageLanguage',
			range: captured.range,
			language
		});
		if (!applied) message = 'Choose a valid language code for a nonempty lyric passage.';
		return applied;
	}
</script>

{#snippet picker()}
	<LanguagePicker
		{language}
		scopeLanguages={selectionLanguages}
		recentLanguages={controller.recentLanguages}
		label={controlsOnly ? 'Selection language' : 'Selected passage language'}
		dialogLabel="Selected passage language"
		expandedLabel
		hideWhenUnavailable={contextual}
		triggerLabel={controlsOnly ? 'Selection language' : undefined}
		showCoverage={!controlsOnly}
		custom
		disabled={!eligible}
		onopen={() => {
			captured = {
				scope,
				range: { ...range },
				text: controller.snapshot.text.slice(range.from, range.to)
			};
			stale = false;
			message = '';
		}}
		onchoose={choose}
		context={captured?.text}
		message={message || (stale ? refusal : '')}
	/>
{/snippet}
{#if controlsOnly}
	{@render picker()}
{:else}
	<section class="passage-language">
		<h2>Passage language</h2>
		<p>Document language: {languageName(controller.language)}</p>
		{#if range.from === range.to}<p>Select lyrics to assign a passage language.</p>{/if}
		{@render picker()}
		{#each model?.languageRanges ?? [] as override (override.id)}
			<div>
				<h3>{languageName(override.language)} ({override.language})</h3>
				<p class="passage-language__excerpt">{model?.content.slice(override.from, override.to)}</p>
				<div class="tool-actions">
					<button
						type="button"
						class="button button--quiet"
						onclick={() => show(override.from, override.to)}>Show passage</button
					>
					<button
						type="button"
						class="button button--quiet"
						disabled={!enabled}
						onclick={() =>
							controller.applyConversionAction({ kind: 'removeDetail', detailId: override.id })}
						>Use document language</button
					>
				</div>
			</div>
		{/each}
	</section>
{/if}

<style>
	/* Quiet and full width, so it is flush: the glyph lines up with the prose
	   above it and the hover fill reaches into the panel's inset. */
	.passage-language :global(.language-trigger) {
		width: calc(100% + 2 * var(--control-padding-inline));
		margin-inline: calc(-1 * var(--control-padding-inline));
	}
	.passage-language__excerpt {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 8lh;
		overflow-y: auto;
	}
</style>
