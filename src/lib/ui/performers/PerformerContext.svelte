<script lang="ts">
	import { performerRangesInSelection } from '#lib/performers/voice-context.js';
	import { lineNumberAt } from '#lib/core/line-numbers.js';
	import { resolveProfileVoiceGroupRanges } from '../state/wiring.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller, active = true }: { controller: WorkbenchController; active?: boolean } =
		$props();
	let previous = '';
	const context = $derived.by(() => {
		if (!active || controller.snapshot.composing) return previous;
		const { snapshot, performers } = controller;
		const ranges = performerRangesInSelection(
			resolveProfileVoiceGroupRanges(snapshot, performers),
			snapshot.selection
		);
		const labels = [
			...new Set(
				ranges.map(({ group }) => {
					const names = group.performerIds.map(
						(id) => performers.find((p) => p.id === id)?.displayName ?? 'Unknown voice'
					);
					return names.length ? names.join(' & ') : 'Unknown voice';
				})
			)
		];
		const selected = snapshot.selection.anchor !== snapshot.selection.head;
		previous = `${selected ? 'Selection' : `Line ${lineNumberAt(snapshot.text, snapshot.selection.head)}`} · ${labels.length ? `Performed by ${labels.join('; ')}` : 'Voice not identified'}`;
		return previous;
	});
</script>

<p class="performer-context" aria-label="Current lyric voices">{context}</p>

<style>
	.performer-context {
		margin: var(--space-3) 0;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
		overflow-wrap: anywhere;
	}
</style>
