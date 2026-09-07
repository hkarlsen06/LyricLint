<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { DemoCaption } from './demo-captions.js';

	let { cues, headerCenter }: { cues: readonly DemoCaption[]; headerCenter: number } = $props();
	let current = $state('');

	const followVideo: Attachment<HTMLElement> = (element) => {
		const video = element.closest('.lp-shot__frame')?.querySelector('video');
		if (!video) return;
		const update = () => {
			current =
				cues.find((cue) => video.currentTime >= cue.start && video.currentTime < cue.end)?.text ??
				'';
		};
		// Frame callbacks follow media time, rather than timeupdate's coarse cadence.
		// Keep the event path for paused seeks; stop scheduling when playback stops.
		let pending: number | undefined;
		// oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser API availability needs a runtime check to retain the animation-frame fallback.
		const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
		const stop = () => {
			if (pending === undefined) return;
			if (frameCallbacks) video.cancelVideoFrameCallback(pending);
			else cancelAnimationFrame(pending);
			pending = undefined;
		};
		const follow = () => {
			pending = undefined;
			update();
			if (!video.paused && !video.ended) {
				pending = frameCallbacks
					? video.requestVideoFrameCallback(follow)
					: requestAnimationFrame(follow);
			}
		};
		const start = () => {
			stop();
			follow();
		};
		const events = ['timeupdate', 'seeking', 'seeked', 'loadeddata', 'emptied'] as const;
		for (const event of events) video.addEventListener(event, update);
		video.addEventListener('play', start);
		video.addEventListener('pause', stop);
		start();
		return () => {
			stop();
			for (const event of events) video.removeEventListener(event, update);
			video.removeEventListener('play', start);
			video.removeEventListener('pause', stop);
		};
	};
</script>

<!-- The video's accessible description supplies the walkthrough without
     repeatedly interrupting screen readers. This overlay takes no pointer hits. -->
<div
	class="demo-captions"
	style:--header-center={`${headerCenter * 100}cqi`}
	aria-hidden="true"
	{@attach followVideo}
>
	<span class="demo-captions__current">{current}</span>
</div>

<style>
	.demo-captions {
		position: absolute;
		z-index: 2;
		/* Width-relative units also resolve in WebKit when the frame height is auto.
		   The captured header sets the minimum height. A wrapped phone caption
		   can grow downward, keeping both lines inside the footage. */
		inset-block-start: 0;
		min-block-size: calc(var(--header-center) * 2);
		display: grid;
		align-items: center;
		inset-inline-start: 50%;
		transform: translateX(-50%);
		inline-size: max-content;
		max-inline-size: 70%;
		color: var(--color-text);
		font-size: clamp(var(--font-size-md), 3cqi, var(--font-size-xl));
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		text-align: center;
		text-wrap: balance;
		pointer-events: none;
		visibility: hidden;
	}

	.demo-captions__current:not(:empty) {
		display: block;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-canvas);
	}

	:global(.lp-shot__frame[data-video-ready]) .demo-captions {
		visibility: visible;
	}

	@media (prefers-reduced-motion: reduce) {
		.demo-captions {
			display: none;
		}
	}
</style>
