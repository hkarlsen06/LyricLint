<script lang="ts" module>
	import shotDimensions from '$lib/assets/shot-dimensions.json';

	type Stem<File> = File extends `${infer Name}.webp` ? Name : never;
	/** A shot with a `<name>.webp` still. Any other name is a type error. */
	export type ShotName = Stem<keyof typeof shotDimensions>;

	const dimensions: Partial<Record<string, { width: number; height: number }>> = shotDimensions;
</script>

<script lang="ts">
	/**
	 * A generated product shot in a docs page: the still at every width the
	 * render wrote, and when a loop exists, the loop over it, played only while
	 * in view and never under reduced motion (`autoplay-in-view.ts`, shared with
	 * the landing page). The still reserves the geometry before anything loads.
	 */
	import { resolve } from '$app/paths';
	import { createAutoplayInView } from '$lib/ui/site/autoplay-in-view.js';

	let { name, alt, caption }: { name: ShotName; alt: string; caption?: string } = $props();

	const base = resolve('/');
	const still = $derived.by(() => {
		const size = dimensions[`${name}.webp`];
		// The type already refuses this; a build from a stale dimensions file
		// still fails loudly rather than drawing a broken image.
		if (!size) throw new Error(`No ${name}.webp in shot-dimensions.json`);
		return size;
	});
	const loop = $derived(dimensions[`${name}.webm`]);
	const srcset = $derived(
		[`${name}-400.webp`, `${name}-640.webp`, `${name}-960.webp`, `${name}.webp`]
			.filter((file) => dimensions[file])
			.map((file) => `${base}${file} ${dimensions[file]!.width}w`)
			.join(', ')
	);

	const autoplayInView = createAutoplayInView('.docs-figure__frame', '.docs-figure__poster');
</script>

<figure class="docs-figure">
	<div class="docs-figure__frame">
		<!-- With a loop, the still is the loop's stand-in and the video carries the
		     description, as on the landing page. -->
		<img
			class="docs-figure__poster"
			src="{base}{name}.webp"
			{srcset}
			sizes="(min-width: 46rem) 40rem, calc(100vw - 3rem)"
			width={still.width}
			height={still.height}
			loading="lazy"
			decoding="async"
			alt={loop ? '' : alt}
			aria-hidden={loop ? 'true' : undefined}
			data-over={loop ? '' : undefined}
		/>
		{#if loop}
			<video
				{@attach autoplayInView}
				src="{base}{name}.webm"
				width={loop.width}
				height={loop.height}
				aria-label={alt}
				loop
				muted
				playsinline
				preload="none"
			></video>
		{/if}
	</div>
	{#if caption}
		<figcaption>{caption}</figcaption>
	{/if}
</figure>

<style>
	.docs-figure {
		margin: var(--space-5) 0;
	}

	/* A screenshot of a dark product on a dark page needs an edge; the raised
	   shadow is it, with no ruled border. */
	.docs-figure__frame {
		position: relative;
		overflow: hidden;
		border-radius: var(--radius-panel);
		background: var(--color-canvas);
		box-shadow: var(--shadow-raised);
	}

	img,
	video {
		display: block;
		width: 100%;
		height: auto;
	}

	/* Over the loop until a decoded frame can replace it; the video alone
	   reserves the geometry. Hidden rather than faded: the frames match. */
	.docs-figure__poster[data-over] {
		position: absolute;
		z-index: 1;
		inset: 0;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}

	.docs-figure__frame:global([data-video-ready]) .docs-figure__poster {
		visibility: hidden;
	}

	figcaption {
		margin-block-start: var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}
</style>
