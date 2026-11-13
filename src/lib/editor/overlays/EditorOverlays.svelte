<script lang="ts">
	import type { Snippet } from 'svelte';
	import PerformerPicker from './PerformerPicker.svelte';
	import SectionPicker from './SectionPicker.svelte';
	import SectionTagPicker from './SectionTagPicker.svelte';
	import DiagnosticPopover from './DiagnosticPopover.svelte';

	let {
		children
	}: {
		children: Snippet<
			[
				typeof PerformerPicker,
				typeof SectionPicker,
				typeof DiagnosticPopover,
				typeof SectionTagPicker
			]
		>;
	} = $props();
</script>

{@render children(PerformerPicker, SectionPicker, DiagnosticPopover, SectionTagPicker)}
