<script lang="ts">
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media }: { media: MediaStore } = $props();

	// Declared once, so the attachment has a stable identity and never re-runs.
	// Re-running it would destroy the iframe and rebuild it — a black flash and a
	// lost playhead every time anything else in the strip changed.
	const mount = (node: HTMLElement) => media.player.mountVideo(node);
</script>

<!--
	The video, mounted by Workspace outside its switchable editor and tool views.
	Desktop always floats a 16:9 frame at the editor’s bottom-right. Every phone view keeps it above playback.
	An independently rendered RightPanel supplies its own mount.

	It is not hidden and it is not decoration: YouTube's embed terms require the
	player to be visible and unobscured, at no less than 200 by 200 pixels. The
	desktop overlay uses that height floor and a 16:9 width. Mobile task views
	keep their compact frame outside the hidden editor and tools regions.

	It draws only while a video is what is attached. A local file is the default
	and gives this band back entirely, the same way the strip itself costs nothing
	while no audio is attached.
-->
<div class="media-video">
	<div class="media-video__frame" {@attach mount}></div>
</div>
