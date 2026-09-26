import type { Attachment } from 'svelte/attachments';
import { prefersReducedMotion } from '$lib/interaction/motion.js';

/*
 * A section's loop plays as an enhancement, never as the markup's own state.
 * There is no `autoplay` attribute, so a reader with no JavaScript gets frame
 * one (the state the loop opens on, which is the same thing the still it
 * replaced used to say) rather than a section that starts halfway through
 * explaining itself. Motion is something the page adds once it knows it is
 * allowed to.
 *
 * **It starts when the section is actually being read, not when the page
 * loads.** Both loops sit most of a screen below the hero, so one started at
 * load has already run itself out by the time anybody scrolls to it, and what
 * they arrive at is the last frame of a demonstration they never saw. An
 * `IntersectionObserver` is what ties the seconds to the reader rather than to
 * the clock, and it stops the loop again on the way past, so a page left open
 * on another section is not decoding video into an empty viewport.
 *
 * `prefers-reduced-motion` gates the whole thing, as it gates every other
 * transition here: asked for stillness, a section keeps frame one, which is
 * the picture it carried before any of this, so the argument is made either
 * way and only the medium changes.
 *
 * It is an **attachment** rather than one bound element and an `onMount`,
 * and it lives here rather than in the landing page, because every loop on
 * the site (the landing page's sections and the docs' figures) plays by it. A
 * rule written per video is a rule that gets copied, and the copy that
 * drifted would be the one nobody is scrolled to.
 *
 * `frameSelector` names the ancestor that receives `data-video-ready` once a
 * decoded frame can replace the still, and `posterSelector` the still inside
 * it; each surface styles the hand-off off those two hooks.
 */
export function createAutoplayInView(
	frameSelector: string,
	posterSelector: string
): Attachment<HTMLVideoElement> {
	return (video) => {
		if (prefersReducedMotion()) return;

		video.defaultPlaybackRate = Number(video.dataset.playbackRate ?? 1);
		video.playbackRate = video.defaultPlaybackRate;
		const frame = video.closest(frameSelector);
		const poster = frame?.querySelector<HTMLImageElement>(posterSelector);
		// A video's native poster is removed when playback starts, not when the
		// first decoded frame is ready to replace it. Keep a real image over the
		// media until the decoder and compositor have both had a turn; otherwise
		// the browser exposes the video's black backing canvas between the two.
		let revealFrame: number | undefined;
		const revealVideo = () => {
			cancelAnimationFrame(revealFrame ?? 0);
			revealFrame = requestAnimationFrame(() => {
				revealFrame = requestAnimationFrame(() => frame?.setAttribute('data-video-ready', ''));
			});
		};
		video.addEventListener('loadeddata', revealVideo);
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) revealVideo();

		// Starting behind an image that has not decoded yet would recreate the
		// same gap at the other edge of the hand-off. The stills are small and
		// decoded only on arrival, so below-fold lazy images stay out of the
		// initial waterfall. The image owns the no-script and reduced-motion state.
		const posterReady = () => poster?.decode().catch(() => undefined) ?? Promise.resolve();
		let shouldPlay = false;
		const observer = new IntersectionObserver(
			([entry]) => {
				shouldPlay = entry.isIntersecting;
				if (!entry.isIntersecting) {
					video.pause();
					// Wound back on the way out as well as on the way in, so a section
					// scrolled past is left showing the state it rests on rather than
					// frozen mid-gesture.
					video.currentTime = 0;
					return;
				}
				// Rewound on every arrival, not resumed. These are demonstrations
				// rather than films: each opens on a problem and ends on it fixed, so
				// a reader who scrolls back to a copy left halfway through meets the
				// result before the gesture that produced it, which is the one order
				// in which none of it explains anything.
				void posterReady().then(() => {
					if (!shouldPlay || !video.isConnected) return;
					// Pick one hero rendition on first playback. A <source> fallback list
					// can download the desktop movie after a failed phone request.
					if (!video.hasAttribute('src') && video.dataset.src) {
						video.src =
							video.dataset.mobileSrc && window.matchMedia('(max-width: 30rem)').matches
								? video.dataset.mobileSrc
								: video.dataset.src;
					}
					video.currentTime = 0;
					// A browser may refuse to start even a muted video, and the refusal is
					// nothing to act on: what is behind it is frame one, which is a
					// complete answer on its own.
					void video.play().catch(() => undefined);
				});
			},
			// Enough of the frame showing that the reader is looking at it rather
			// than passing it. These shots are tall, so a threshold on their own
			// area is the honest measure of "on screen".
			{ threshold: 0.35 }
		);
		observer.observe(video);
		return () => {
			observer.disconnect();
			video.removeEventListener('loadeddata', revealVideo);
			cancelAnimationFrame(revealFrame ?? 0);
		};
	};
}
