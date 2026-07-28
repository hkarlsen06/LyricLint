<script lang="ts">
	let { title }: { title?: string } = $props();

	/**
	 * What this tab calls itself while it is a development server.
	 *
	 * A workbench tab is named after the draft, which is named after the song — so
	 * a dev server and the deployed build, both open on the same transcription,
	 * are two tabs carrying the same artist and title with nothing at a tab's
	 * width to tell them apart. `PUBLIC_DEV_TAB_TITLE` is the word that replaces
	 * the pair: `Dev` in `.env.example`, and something more specific where two dev
	 * servers are up at once.
	 *
	 * It replaces the whole title rather than prefixing it, because a tab shows
	 * the first few characters and a prefix worth having is one that is all that
	 * gets read.
	 *
	 * Gated on `import.meta.env.DEV`, a build-time constant, so the label cannot
	 * reach a production bundle even from an `.env.local` — the hazard
	 * `.env.example` opens by naming. It is read in the component body rather than
	 * at module scope so a test can stub it per render.
	 */
	const devTitle = import.meta.env.DEV ? import.meta.env.PUBLIC_DEV_TAB_TITLE?.trim() : undefined;

	const documentTitle = $derived(devTitle || (title ? `${title} · LyricLint` : 'LyricLint'));
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>
