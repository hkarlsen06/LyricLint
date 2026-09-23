<script lang="ts">
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media }: { media: MediaStore } = $props();

	// Declared once, so the attachment has a stable identity and never re-runs.
	// Re-running it would destroy the iframe and rebuild it: a black flash and a
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

<style>
	/*
	 * The video band.
	 *
	 * `flex: none` because the panel column hands all its slack to the body: the
	 * picture is a fixed thing to look at, and a frame that stretched or collapsed
	 * with the window would be one more thing moving while somebody types.
	 *
	 * It is `--color-chrome`, like the ignored-rules footer above it and the tab
	 * strip at the other end of the column. That is the panel's own rule rather than
	 * a preference: `--color-canvas` is spent on the recessed selected diagnostic,
	 * so anything hanging outside the run of cards is chrome or it is a card, and
	 * there is no third material here.
	 */
	.media-video {
		/*
		 * YouTube's embed terms require a visible player of at least 200 by 200
		 * pixels. This is `px` and not `rem` on purpose, and it is the one place in
		 * the system where that is right: a `rem` shrinks with the reader's root font
		 * size, and a minimum set by somebody else is not ours to scale below.
		 */

		display: flex;
		flex: none;
		padding: var(--space-2) var(--space-3);
		background: var(--color-chrome);
	}

	/*
	 * The frame takes the panel's width, and the aspect ratio gives way to the floor
	 * rather than the other way round.
	 *
	 * At the panel's narrowest (21rem, less its border and this padding) 16:9 would
	 * compute a height under 200px, so `min-height` overrides the ratio and the
	 * picture is pillarboxed by a few pixels inside a slightly wide box. That is the
	 * right end of the trade: a couple of pixels of black beside the video costs
	 * nothing, and a frame 189px tall is a term broken quietly.
	 */
	.media-video__frame {
		width: 100%;
		min-width: var(--media-video-min);
		min-height: var(--media-video-min);
		overflow: hidden;
		border-radius: var(--radius-control);
		aspect-ratio: 16 / 9;
		background: var(--color-canvas);
	}

	/*
	 * The IFrame API writes its own `width` and `height` attributes on the element
	 * it creates, so the frame's size is only the frame's size once they are
	 * overridden here.
	 */
	.media-video__frame :global(iframe) {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
	}

	/* Workspace's phone task views keep a compact square frame above playback. */
	@media (pointer: coarse) and (max-width: 68rem) {
		:global(.workspace-video) .media-video {
			margin: 0;
		}

		:global(.workspace-video) .media-video__frame {
			width: var(--media-video-min);
			margin-inline: auto;
			aspect-ratio: 1;
		}
	}

	/* The desktop overlay in Workspace draws the frame flush and at 16:9. */
	:global(.workspace[data-video-floating='true'] .workspace-video) .media-video {
		padding: 0;
	}

	:global(.workspace[data-video-floating='true'] .workspace-video) .media-video__frame {
		aspect-ratio: 16 / 9;
	}
</style>
