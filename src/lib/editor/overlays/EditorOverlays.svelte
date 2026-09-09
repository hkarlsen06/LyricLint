<script lang="ts">
	import type { Snippet } from 'svelte';
	import PerformerPicker from './PerformerPicker.svelte';
	import SectionPicker from './SectionPicker.svelte';
	import DiagnosticPopover from './DiagnosticPopover.svelte';

	let {
		children
	}: {
		children: Snippet<[typeof PerformerPicker, typeof SectionPicker, typeof DiagnosticPopover]>;
	} = $props();
</script>

{@render children(PerformerPicker, SectionPicker, DiagnosticPopover)}
