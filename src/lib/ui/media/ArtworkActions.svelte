<script lang="ts">
	import { Check, Copy } from 'lucide-svelte';
	import { copyText, downloadImage } from '../clipboard.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let {
		artwork,
		name,
		announce
	}: {
		artwork: string;
		/** The track's name, which becomes the saved file's. */
		name?: string;
		announce?: (message: string) => void;
	} = $props();

	let saving = $state(false);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(copiedTimer));

	/** A track name is a filename here, and `Artist — Track` is full of nothing a
	 *  file system minds except the separators. */
	function filename(): string {
		return `${(name ?? 'Album art').replace(/[\\/:*?"<>|]/gu, '-').trim()}.jpg`;
	}

	async function save(): Promise<void> {
		saving = true;
		try {
			await downloadImage(artwork, filename());
		} finally {
			saving = false;
		}
	}

	async function copyUrl(): Promise<void> {
		try {
			await copyText(artwork);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 2000);
			announce?.('Image URL copied.');
		} catch {
			announce?.('The image URL could not be copied.');
		}
	}
</script>

<!--
	Copying the cover's address and saving its bytes, as one pair wherever the
	cover is offered — the Song panel's metadata section and the artwork dialog
	both render this rather than mirroring two buttons by hand, so the labels,
	the copied confirmation and the fallback behaviour cannot drift apart.
-->
<div class="artwork-actions">
	<button type="button" class="button" onclick={() => copyUrl()}>
		{#if copied}
			<Check aria-hidden="true" size={14} strokeWidth={2.25} />
		{:else}
			<Copy aria-hidden="true" size={14} strokeWidth={2.25} />
		{/if}
		{copied ? 'Image URL copied' : 'Copy image URL'}
	</button>
	<!-- The label stays put and a loading mark joins it: a control whose text
	     changes under the press reflows the row it was pressed in. -->
	<button type="button" class="button" disabled={saving} aria-busy={saving} onclick={() => save()}>
		{#if saving}
			<LoadingMark />
		{/if}
		Download album art
	</button>
</div>
