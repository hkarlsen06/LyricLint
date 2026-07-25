<script lang="ts">
	let { title }: { title?: string } = $props();

	const documentTitle = $derived(title ? `${title} · LyricLint` : 'LyricLint');
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>
