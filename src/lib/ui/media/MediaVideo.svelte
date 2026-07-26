<script lang="ts">
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media }: { media: MediaStore } = $props();

	// Declared once, so the attachment has a stable identity and never re-runs.
	// Re-running it would destroy the iframe and rebuild it — a black flash and a
	// lost playhead every time anything else in the strip changed.
	const mount = (node: HTMLElement) => media.player.mountVideo(node);
</script>

<!--
	The video, at the foot of the right panel and directly above the status bar.

	It is not hidden and it is not decoration: YouTube's embed terms require the
	player to be visible and unobscured, at no less than 200 by 200 pixels. The
	panel is narrower than the 356px a 200px-tall 16:9 frame wants at its
	narrowest, so the frame takes the panel's width and holds 200px as a floor —
	which pillarboxes the picture by a few pixels there rather than shrinking it
	below a minimum that is not ours to set. Anything larger would be a video
	player in a transcription workbench, which is not what anyone opened.

	It draws only while a video is what is attached. A local file is the default
	and gives this band back entirely, the same way the strip itself costs nothing
	while no audio is attached.
-->
<div class="media-video">
	<div class="media-video__frame" {@attach mount}></div>
</div>
