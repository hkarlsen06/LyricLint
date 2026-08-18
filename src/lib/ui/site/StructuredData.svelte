<script lang="ts">
	let { data }: { data: unknown } = $props();

	const serialized = $derived((JSON.stringify(data) ?? 'null').replaceAll('<', '\\u003c'));
	const closingTag = '</' + 'script>';
	const markup = $derived(`<script type="application/ld+json">${serialized}${closingTag}`);
</script>

<svelte:head>
	<!-- The tag and escaped payload are built here rather than accepted as markup. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markup is built locally from JSON with closing-tag characters escaped. -->
	{@html markup}
</svelte:head>
