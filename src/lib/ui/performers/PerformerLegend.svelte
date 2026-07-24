<script lang="ts">
	import type { ParsedDocument, PerformerRecord, StyleSlot } from '$lib/core/types.js';

	let {
		document,
		performers
	}: {
		document: ParsedDocument;
		performers: readonly PerformerRecord[];
	} = $props();

	const slotLabels: Record<StyleSlot, string> = {
		1: 'plain',
		2: 'italic',
		3: 'bold',
		4: 'bold italic'
	};

	function groupName(performerIds: readonly string[], rawNameText?: string): string {
		const names = performerIds
			.map((id) => performers.find((performer) => performer.id === id)?.displayName)
			.filter((name): name is string => Boolean(name));
		return names.length > 0 ? names.join(' & ') : (rawNameText ?? 'Unresolved voice');
	}

	const sectionsWithVoices = $derived(
		document.sections.filter((section) => section.voiceGroups.length > 0)
	);
</script>

<section class="performer-legend" aria-label="Section performer legend">
	<h3>Section legend</h3>
	{#if sectionsWithVoices.length === 0}
		<p class="empty-state">
			Performer assignments will remain listed here without requiring hover.
		</p>
	{:else}
		<ol>
			{#each sectionsWithVoices as section, index (section.from)}
				<li>
					<strong>{section.header?.name ?? `Headerless section ${index + 1}`}</strong>
					<ul>
						{#each section.voiceGroups as group (group.id)}
							<li>
								<span>{groupName(group.performerIds, group.rawNameText)}</span>
								<span>Slot {group.styleSlot}, {slotLabels[group.styleSlot]}</span>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</section>
