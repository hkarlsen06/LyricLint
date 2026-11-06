<script lang="ts">
	import { contentOffset, projectOffset, renderProfile } from '#lib/conversion/index.js';
	import { languageName } from '#lib/languages/options.js';
	import LanguagePicker from '../layout/LanguagePicker.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
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
		let from = contentOffset(projection.value, range.from, 1);
		let to = contentOffset(projection.value, range.to, -1);
		for (const segment of projection.value.segments) {
			if (segment.kind === 'transformed' && segment.from < range.to && range.from < segment.to) {
				from = Math.min(from, segment.contentFrom);
				to = Math.max(to, segment.contentTo);
			}
		}
		if (from >= to) return [controller.language];
		const languages: string[] = [];
		let at = from;
		for (const entry of [...conversion.model.languageRanges].sort((a, b) => a.from - b.from)) {
			const start = Math.max(from, entry.from);
			const end = Math.min(to, entry.to);
			if (start >= end) continue;
			if (at < start) languages.push(conversion.model.defaultLanguage);
			languages.push(entry.language);
			at = end;
		}
		if (at < to) languages.push(conversion.model.defaultLanguage);
		return [...new Set(languages)];
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

<section class="passage-language">
	<h2>Passage language</h2>
	<p>Document language: {languageName(controller.language)}</p>
	{#if range.from === range.to}
		<p>Select lyrics to assign a passage language.</p>
	{/if}
	<LanguagePicker
		{language}
		scopeLanguages={selectionLanguages}
		recentLanguages={controller.recentLanguages}
		label="Selected passage language"
		expandedLabel
		showCoverage
		custom
		disabled={range.from === range.to || !enabled}
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

<style>
	.passage-language :global(.language-trigger) {
		width: 100%;
	}
	.passage-language__excerpt {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 8lh;
		overflow-y: auto;
	}
</style>
