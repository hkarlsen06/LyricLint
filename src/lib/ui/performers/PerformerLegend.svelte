<script lang="ts">
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import { SvelteMap } from 'svelte/reactivity';
	import type { ParsedDocument, PerformerRecord, StyleSlot, VoiceGroup } from '$lib/core/types.js';

	let {
		document,
		performers,
		active = true
	}: {
		document: ParsedDocument;
		performers: readonly PerformerRecord[];
		active?: boolean;
	} = $props();

	const slotLabels = {
		1: '',
		2: 'italic',
		3: 'bold',
		4: 'bold italic'
	} satisfies Record<StyleSlot, string>;

	function groupName(performerIds: readonly string[], rawNameText?: string): string {
		const names = performerIds
			.map((id) => performers.find((performer) => performer.id === id)?.displayName)
			.filter((name): name is string => Boolean(name));
		return names.length > 0 ? names.join(' & ') : (rawNameText ?? 'Unresolved voice');
	}

	// A recurring chorus does not need to repeat an unchanged formatting key.
	// Preserve group order and slots: a different assignment is a different key.
	let lastArrangements: Array<{ key: string; voices: VoiceGroup[]; sections: string[] }> = [];
	const arrangements = $derived.by(() => {
		if (!active) return lastArrangements;
		const grouped = new SvelteMap<string, { voices: VoiceGroup[]; sections: string[] }>();
		for (const [index, section] of document.sections.entries()) {
			if (section.voiceGroups.length === 0) continue;
			const key = JSON.stringify(
				section.voiceGroups.map((group) => [
					group.performerIds.length > 0 ? group.performerIds : group.rawNameText,
					group.styleSlot
				])
			);
			let arrangement = grouped.get(key);
			if (!arrangement) {
				arrangement = { voices: section.voiceGroups, sections: [] };
				grouped.set(key, arrangement);
			}
			const name = section.header?.name ?? 'Headerless section';
			arrangement.sections.push(`${index + 1}. ${name}`);
		}
		lastArrangements = [...grouped].map(([key, arrangement]) => ({ key, ...arrangement }));
		return lastArrangements;
	});
</script>

{#if arrangements.length > 0}
	<details class="performer-legend">
		<summary class="performer-legend__summary">
			<h2>Performers by section</h2>
			<ChevronRight class="performer-legend__chevron" aria-hidden="true" />
		</summary>
		<ul class="performer-legend__groups">
			{#each arrangements as arrangement (arrangement.key)}
				<li class="performer-legend__group">
					<div class="performer-legend__voices">
						{#each arrangement.voices as group (group.id)}
							<span class="performer-legend__voice" data-slot={group.styleSlot}>
								{groupName(group.performerIds, group.rawNameText)}
								{#if group.styleSlot !== 1}
									<span class="sr-only"> ({slotLabels[group.styleSlot]})</span>
								{/if}
							</span>
						{/each}
					</div>
					<p class="performer-legend__sections">{arrangement.sections.join(' · ')}</p>
				</li>
			{/each}
		</ul>
	</details>
{/if}
