<script lang="ts">
	import shotDimensions from '$lib/assets/shot-dimensions.json';
	import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import { authorityLabels, type GuidanceAuthority } from '$lib/guidance/guidance.js';
	import { maintainerStructuredData, siteUrl } from '$lib/seo.js';
	import AuthorityLadder from '$lib/ui/site/AuthorityLadder.svelte';
	import LazyLiveDemo from '$lib/ui/site/LazyLiveDemo.svelte';
	import DemoCaptions from '$lib/ui/site/DemoCaptions.svelte';
	import { heroCaptions, heroPlaybackRate, playerCaptions } from '$lib/ui/site/demo-captions.js';
	import LyricIcon from '$lib/ui/site/LyricIcon.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import { createAutoplayInView } from '$lib/ui/site/autoplay-in-view.js';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	// The loop hand-off every site video shares; see `autoplay-in-view.ts`.
	const autoplayInView = createAutoplayInView('.lp-shot__frame', '.lp-shot__poster');

	// Read off the registry rather than typed into the copy. A landing page that
	// states a count is making a claim about the product, and a hand-written one
	// is wrong the first time a rule ships.
	const ruleCount = $derived(data.ruleCount);
	const guidanceCount = $derived(data.guidanceCount);
	const guidanceTopicCount = $derived(data.guidanceTopicCount);
	const pageTitle = 'Free lyric formatter for Genius transcriptions · LyricLint';
	// Kept under 160 characters: Google truncates around there, and a description
	// cut mid-sentence reads worse than a shorter one that ends on its own.
	const pageDescription = $derived(
		`Format Genius lyrics for free. Check ${ruleCount} reviewed rules, spelling, and grammar in your browser.`
	);
	const socialDescription =
		'Paste your lyrics. Review formatting fixes and their sources. Copy the finished text into Genius.';
	const canonicalUrl = siteUrl('/');
	const appUrl = siteUrl('/workbench/');
	const harperUrl = $derived(data.harperUrl);
	// The `WebSite` node is what Google's site-name feature reads. Without it,
	// results print the bare domain where the brand should be. It belongs on the
	// homepage and only the homepage, which is where Google looks for it.
	const websiteData = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'LyricLint',
		url: canonicalUrl,
		creator: maintainerStructuredData
	};
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'LyricLint',
		url: appUrl,
		description: pageDescription,
		author: maintainerStructuredData,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires a modern web browser',
		offers: {
			'@type': 'Offer',
			price: 0,
			priceCurrency: 'USD'
		}
	});

	// Invented lyrics with three ordinary formatting errors: an unbracketed header,
	// a parenthesized unknown word, and a lowercase ad-lib. Keep the first interaction small and approachable.
	const messy = `Verse 1:
I counted every (?) on the way
You said we'd drive until the radio gave out (yeah)`;

	// Two corrections floating over the hero, each a flagged form over the form
	// the linter writes. They used to be four scattered chips of bare notation,
	// which was the reference composition's floating-logos gesture with the
	// content swapped; showing the *fix* instead is the one thing this product
	// does that a logo cloud cannot, and it puts the editor's own wavy underline
	// on the first screen.
	//
	// Decorative and `aria-hidden`: both corrections are made again in prose and
	// in the demo further down, so nothing is carried by these alone. Every
	// string is short, which is a constraint rather than a coincidence. See the
	// note above their positions in this page's styles.
	const marks = [
		{ key: 'header', flagged: 'Verse 1:', fixed: '[Verse 1]' },
		{ key: 'adlib', flagged: '(yeah)', fixed: '(Yeah)' }
	];

	/*
	 * Three real entries from the guidance catalog, one per tier the catalog
	 * currently holds, reproduced as markup rather than screenshotted for the
	 * linter panel's reason: legible at any width and in the accessible tree.
	 * The titles quote `src/lib/guidance/entries.ts`, so a reworded entry means
	 * re-quoting it here; grep for the title. The tier label and its ladder
	 * both come off `authority`, through the same `authorityLabels` and
	 * `AuthorityLadder` the topic pages draw theirs with, so the reproduction
	 * cannot come to state a standing differently than the page it reproduces.
	 */
	interface LandingGuideline {
		key: string;
		title: string;
		authority: GuidanceAuthority;
		correct?: string;
		incorrect?: string;
	}

	const guidelines: readonly LandingGuideline[] = [
		{
			key: 'headers',
			title: 'Song parts open with bracketed headers',
			correct: '[Verse 1]',
			incorrect: 'Verse 1:',
			authority: 'staff'
		},
		{
			key: 'parens',
			title: 'Parentheses sit outside voice formatting',
			correct: 'We own the night (<i>We own it</i>)',
			incorrect: 'We own the night <i>(We own it)</i>',
			authority: 'editorial'
		},
		{
			key: 'blank-line',
			title: 'One blank line between song parts',
			authority: 'lyriclint'
		}
	];
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={socialDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={socialDescription} />
</svelte:head>

<StructuredData data={websiteData} />
<StructuredData data={structuredData} />

<main id="main" tabindex="-1" class="lp">
	<!-- The hero carries the claim and the evidence in one screen. It used to
	     reserve a viewport for four small centred elements and leave a peek of
	     the demo showing underneath, which was the right answer while the
	     evidence was below the fold; the product shot is *in* the hero now, so
	     there is nothing left to peek at and nothing to reserve. -->
	<section class="lp-hero">
		<div class="lp-hero__float" aria-hidden="true">
			{#each marks as mark (mark.key)}
				<span class="lp-hero__mark lp-hero__mark--{mark.key}">
					<span class="lp-hero__flagged">{mark.flagged}</span>
					<span class="lp-hero__fixed">{mark.fixed}</span>
				</span>
			{/each}
		</div>

		<div class="lp-container lp-hero__inner">
			<h1>Catch Genius formatting problems before you submit.</h1>

			<p class="lp-hero__sub">
				Paste your lyrics to check their formatting. See what needs fixing and read the source
				behind each suggestion.
			</p>

			<!-- The workbench is primary; the guide is the secondary action. -->
			<div class="lp-hero__actions">
				<a class="button button--contrast" href={resolve('/workbench/')}>
					<LyricIcon />
					<span>Open the workbench</span>
				</a>
				<a class="button" href={resolve('/guidelines/')}>
					<BookOpenIcon aria-hidden="true" size={16} weight="bold" />
					<span>Read the transcription guide</span>
				</a>
			</div>

			<!-- Community and repository links sit below the main actions. -->
			<p class="site-meta">
				<a
					class="site-meta__fact site-meta__link"
					href="https://discord.gg/5mnSnUhtt8"
					rel="external noopener"
					target="_blank"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
						/>
					</svg>
					<span>Join the Discord</span>
					<span class="sr-only">(opens in a new tab)</span>
				</a>
				<span class="site-meta__fact">
					<span class="site-meta__separator" aria-hidden="true">·</span>
					<a
						class="site-meta__fact site-meta__link"
						href="https://github.com/hkarlsen06/LyricLint"
						rel="external"
					>
						<svg
							class="site-meta__github"
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
							/>
						</svg>
						<span>Open source</span>
					</a>
				</span>
			</p>

			<!-- The City Lights scene in `scripts/hero-shot-scene.mjs` drives the real
			     workbench from a blank draft through YouTube attachment, transcription,
			     replay, review, and linked chorus corrections. The author authorized
			     the lyrics and artwork; only the capture provider clock is simulated.

			     The responsive still shows the same song populated in Review, at the
			     video's exact ratio, rather than the blank opening frame. It stays
			     above the video until a decoded frame can replace it. There is no
			     native poster, avoiding a duplicate full-size download. `preload="none"`
			     leaves playback to the observer; without JavaScript or with reduced
			     motion the still stays. -->
			<div class="lp-shot">
				<div class="lp-shot__frame">
					<div class="lp-shot__media">
						<img
							class="lp-shot__poster"
							src="{resolve('/')}workbench.webp"
							srcset="{resolve('/')}workbench-640.webp {shotDimensions['workbench-640.webp']
								.width}w, {resolve('/')}workbench-1280.webp {shotDimensions['workbench-1280.webp']
								.width}w, {resolve('/')}workbench-1920.webp {shotDimensions['workbench-1920.webp']
								.width}w, {resolve('/')}workbench.webp {shotDimensions['workbench.webp'].width}w"
							sizes="(min-width: 74rem) 71rem, calc(100vw - 3rem)"
							fetchpriority="high"
							width={shotDimensions['workbench.webp'].width}
							height={shotDimensions['workbench.webp'].height}
							alt=""
							aria-hidden="true"
						/>
						<!-- Named by `aria-label` for the reason the performer loop is, and
					     deliberately not `role="img"`, which the platform refuses on a
					     `<video>`. -->
						<video
							{@attach autoplayInView}
							data-src="{resolve('/')}workbench.webm"
							data-mobile-src="{resolve('/')}workbench-mobile.webm"
							data-playback-rate={heroPlaybackRate}
							width={shotDimensions['workbench.webm'].width}
							height={shotDimensions['workbench.webm'].height}
							aria-label="City Lights is attached through YouTube in a blank draft. A phrase is transcribed, then playback resumes two seconds earlier to hear it again. On-screen keys show the shortcuts. The remaining typing speeds up, a section header is corrected, and the choruses are linked while preserving their different ad-libs. Two spelling fixes update both choruses, preserving their different ad-libs and leaving no findings. The finished lyrics are copied to the clipboard."
							loop
							muted
							playsinline
							preload="none"
						></video>
					</div>
					<DemoCaptions cues={heroCaptions} headerCenter={28 / 1280} />
				</div>
			</div>
		</div>
	</section>

	<section class="lp-section" aria-labelledby="player-heading">
		<div class="lp-container lp-split lp-player">
			<figure class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<div class="lp-shot__media">
						<img
							class="lp-shot__poster"
							src="{resolve('/')}workbench-player.webp"
							srcset="{resolve('/')}workbench-player-400.webp {shotDimensions[
								'workbench-player-400.webp'
							].width}w, {resolve('/')}workbench-player-640.webp {shotDimensions[
								'workbench-player-640.webp'
							].width}w, {resolve('/')}workbench-player-960.webp {shotDimensions[
								'workbench-player-960.webp'
							].width}w, {resolve('/')}workbench-player.webp {shotDimensions[
								'workbench-player.webp'
							].width}w"
							sizes="(max-width: 64rem) min(56rem, calc(100vw - 3rem)), (min-width: 74rem) 34.85rem, calc((100vw - 3rem - 4vw) * 1.05 / 2.05)"
							loading="lazy"
							width={shotDimensions['workbench-player.webp'].width}
							height={shotDimensions['workbench-player.webp'].height}
							alt=""
							aria-hidden="true"
						/>
						<video
							{@attach autoplayInView}
							src="{resolve('/')}workbench-player.webm"
							width={shotDimensions['workbench-player.webm'].width}
							height={shotDimensions['workbench-player.webm'].height}
							aria-label="An example track is synced to every lyric line with Space in an accelerated demonstration. Dragging the player’s scrubber moves the yellow highlight through the lyrics. Clicking a line number jumps to that line and plays it. On-screen keypresses show Escape pausing and resuming two seconds earlier, then Shift+Escape and Option+Escape stepping between synced lines."
							loop
							muted
							playsinline
							preload="none"
						></video>
					</div>
					<DemoCaptions cues={playerCaptions} headerCenter={22 / 688} />
				</div>
			</figure>
			<div class="lp-split__copy">
				<h2 id="player-heading">Keep your hands on the lyrics.</h2>
				<p class="lp-prose">
					Play YouTube or Apple Music beside your draft. Pause, type, and replay without switching
					tabs.
				</p>
				<p class="lp-prose">
					<strong>Pause. Type. Hear it again.</strong> Press <kbd>Esc</kbd> to pause. Press it again to
					replay the last two seconds and carry on.
				</p>
				<p class="lp-prose">
					<strong>Jump straight to a line.</strong> Choose Sync lyrics, then tap <kbd>Space</kbd> as each
					line starts. Click a line number to play from there.
				</p>
				<p class="lp-prose lp-player__keys">
					<span><kbd>Shift</kbd> + <kbd>Esc</kbd> back</span>
					<span><kbd>Option / Alt</kbd> + <kbd>Esc</kbd> forward</span>
				</p>
				<p class="lp-prose">
					Loop a tricky passage, or slow down YouTube playback when the video supports it.
				</p>
			</div>
		</div>
	</section>

	<section class="lp-section" aria-labelledby="song-heading">
		<div class="lp-container lp-split lp-split--flip">
			<figure class="lp-shot lp-shot--detail lp-shot--song">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-song.webp"
						srcset="{resolve('/')}workbench-song-400.webp {shotDimensions['workbench-song-400.webp']
							.width}w, {resolve('/')}workbench-song-640.webp {shotDimensions[
							'workbench-song-640.webp'
						].width}w, {resolve('/')}workbench-song.webp {shotDimensions['workbench-song.webp']
							.width}w"
						sizes="min(26rem, calc(100vw - 3rem))"
						loading="lazy"
						width={shotDimensions['workbench-song.webp'].width}
						height={shotDimensions['workbench-song.webp'].height}
						alt=""
						aria-hidden="true"
					/>
					<video
						{@attach autoplayInView}
						src="{resolve('/')}workbench-song.webm"
						width={shotDimensions['workbench-song.webm'].width}
						height={shotDimensions['workbench-song.webm'].height}
						aria-label="The Song panel shows release date, writers, album, and label. Clicking Avery Lane copies that writer’s name. Copy image URL confirms the artwork link was copied, then Download album art saves the cover."
						loop
						muted
						playsinline
						preload="none"
					></video>
				</div>
				<figcaption class="lp-shot__caption">Example credits in the real Song panel.</figcaption>
			</figure>
			<div class="lp-split__copy">
				<h2 id="song-heading">Bring the credits and cover to Genius.</h2>
				<p class="lp-prose">
					Apple Music brings the song details, too. See the writer credits and release details Apple
					provides in the Song panel. Click a value to copy it, including individual writer names.
				</p>
				<p class="lp-prose">
					Copy the album art’s image URL or download the cover, ready for adding the song to Genius.
					The details you need stay beside the transcription you’re working on.
				</p>
				<p class="lp-prose">
					Full-track Apple Music playback requires an Apple Music subscription. Credits vary by
					release, so check them before submitting.
				</p>
			</div>
		</div>
	</section>

	<!-- The live editor uses the same evidence-and-copy split as the detail demos. -->
	<section class="lp-section">
		<div class="lp-container lp-split lp-split--flip lp-demo">
			<LazyLiveDemo text={messy} performerNames={['Avery', 'Blair']} />

			<div class="lp-split__copy">
				<h2>Try the editor right here.</h2>
				<p class="lp-prose">
					Try fixing the section header, the <code class="site-code">(?)</code> marker, and the lowercase
					ad-lib. Hover over an underline to see the suggested fix, then try it in the lyrics.
				</p>
			</div>
		</div>
	</section>

	<section class="lp-section">
		<div class="lp-container lp-split">
			<!-- Generated by `scripts/render-motion.mjs`: the real editor assigning
			     two performers. The video reserves its actual 1264×1618 ratio before
			     metadata arrives. The overlaid still is fitted to that frame instead
			     of becoming a native poster that changes the video's intrinsic ratio.
			     Both image and video wait until this section is near or in view. -->
			<div class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-performers.webp"
						srcset="{resolve('/')}workbench-performers-400.webp {shotDimensions[
							'workbench-performers-400.webp'
						].width}w, {resolve('/')}workbench-performers-640.webp {shotDimensions[
							'workbench-performers-640.webp'
						].width}w, {resolve('/')}workbench-performers-960.webp {shotDimensions[
							'workbench-performers-960.webp'
						].width}w, {resolve('/')}workbench-performers.webp {shotDimensions[
							'workbench-performers.webp'
						].width}w"
						sizes="(max-width: 64rem) min(56rem, calc(100vw - 3rem)), (min-width: 74rem) 34.85rem, calc((100vw - 3rem - 4vw) * 1.05 / 2.05)"
						loading="lazy"
						width={shotDimensions['workbench-performers.webp'].width}
						height={shotDimensions['workbench-performers.webp'].height}
						alt=""
						aria-hidden="true"
					/>
					<!-- Named by `aria-label`, carrying the description the still
					     carried, because a silent loop of a pointer using the product
					     should be announced the way the picture it replaces was.
					     Deliberately not `role="img"`, which is what one wants to reach
					     for here and which the platform refuses: a `<video>` may not be
					     relabelled as an image. There is nothing to hear and no
					     controls, so what is left (an embedded object with an
					     accessible name) is the honest description of it. -->
					<video
						{@attach autoplayInView}
						src="{resolve('/')}workbench-performers.webm"
						width={shotDimensions['workbench-performers.webm'].width}
						height={shotDimensions['workbench-performers.webm'].height}
						aria-label="Words are selected in the editor and assigned to Avery. The rest of the section is assigned to Avery and Blair together. LyricLint adds the performer names to the header and wraps the selected words in italics markup. Coloured marks beside the lines show who sings them."
						loop
						muted
						playsinline
						preload="none"
					></video>
				</div>
			</div>

			<div class="lp-split__copy">
				<h2>Select the words. Choose who sings them.</h2>

				<p class="lp-prose">
					Genius uses HTML to mark who sings each line. The tags need to match the performer names
					in the section header. Keeping them in sync by hand takes time.
				</p>

				<p class="lp-prose">
					Select the words and choose a performer. LyricLint adds the markup and updates the header
					in one edit. You can undo it in one press. Colours help you follow each voice in the
					editor. <strong>The colours stay in the editor.</strong> Your copied text contains only Genius
					markup.
				</p>

				<p class="lp-prose">
					Try it in the demo above. Fix the section header first, then select some words and choose
					Avery or Blair.
				</p>
			</div>
		</div>
	</section>

	<section class="lp-section">
		<div class="lp-container lp-split lp-split--flip">
			<!-- Generated by `scripts/render-motion.mjs --harper`: a real Harper
			     underline in the real editor, hovered the way a reader hovers it,
			     read, and fixed. The still it replaced could show the open card and
			     stop there; what the loop adds is the press: that the button beside
			     the explanation does what the explanation says.

			     The video reserves its actual 1026×586 ratio. The lazy overlaid image
			     keeps the opening finding visible before playback, including without
			     JavaScript, without setting the video's intrinsic geometry. -->
			<div class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-harper.webp"
						srcset="{resolve('/')}workbench-harper-400.webp {shotDimensions[
							'workbench-harper-400.webp'
						].width}w, {resolve('/')}workbench-harper-640.webp {shotDimensions[
							'workbench-harper-640.webp'
						].width}w, {resolve('/')}workbench-harper-960.webp {shotDimensions[
							'workbench-harper-960.webp'
						].width}w, {resolve('/')}workbench-harper.webp {shotDimensions['workbench-harper.webp']
							.width}w"
						sizes="(max-width: 64rem) min(56rem, calc(100vw - 3rem)), (min-width: 74rem) 34.85rem, calc((100vw - 3rem - 4vw) * 1.05 / 2.05)"
						loading="lazy"
						width={shotDimensions['workbench-harper.webp'].width}
						height={shotDimensions['workbench-harper.webp'].height}
						alt=""
						aria-hidden="true"
					/>
					<video
						{@attach autoplayInView}
						src="{resolve('/')}workbench-harper.webm"
						width={shotDimensions['workbench-harper.webm'].width}
						height={shotDimensions['workbench-harper.webm'].height}
						aria-label="The line 'I has counted every streetlight' has a wavy underline. Hovering opens a Harper suggestion that explains the grammar mistake and asks you to review it in context. The preview strikes out 'has' and adds 'have'. Pressing Replace with have fixes the line and removes the underline."
						loop
						muted
						playsinline
						preload="none"
					></video>
				</div>
			</div>

			<div class="lp-split__copy">
				<h2>Spelling and grammar that never leave the page.</h2>
				<p class="lp-prose">
					<a href={harperUrl} rel="external">Harper</a> checks English spelling and grammar in your browser.
					It is open source. Your lyrics are never sent to Harper or a LyricLint server for these checks.
				</p>
				<p class="lp-prose">
					Lyrics often bend grammar rules. You review every Harper suggestion before applying it.
					Its dictionary includes performer names and Genius spellings like <code class="site-code"
						>ayy</code
					>. LyricLint follows the Genius rules when the two disagree.
				</p>
			</div>
		</div>
	</section>

	<!-- The evidence first and the explanation under it, which is also the order
	     they stack in when the columns collapse. -->
	<section class="lp-section">
		<div class="lp-container lp-split">
			<div class="lp-panel">
				<div class="lp-panel__head">Review</div>
				<div class="lp-finding-list">
					<div class="lp-finding">
						<span class="lp-finding__message">Write this section header as [Verse 1].</span>
						<div class="diagnostic-meta">
							<span class="diagnostic-meta__row">
								<SeverityTag severity="warning" labelled={false} />
								<span>Line 1</span>
								<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
								<a href="{resolve('/(site)/guidelines/[topic]', { topic: 'section-headers' })}/"
									>How to Add Songs to Genius</a
								>
							</span>
						</div>
					</div>
					<div class="lp-finding">
						<span class="lp-finding__message">Capitalize this parenthesized ad-lib.</span>
						<div class="diagnostic-meta">
							<span class="diagnostic-meta__row">
								<SeverityTag severity="suggestion" labelled={false} />
								<span>Line 3</span>
								<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
								<a href="{resolve('/(site)/guidelines/[topic]', { topic: 'ad-libs' })}/">Ad-libs</a>
							</span>
						</div>
					</div>
				</div>
			</div>

			<div class="lp-split__copy">
				<h2>Every warning carries its source.</h2>
				<p class="lp-prose">
					{ruleCount} reviewed checks cover headers, performer markup, punctuation, and spelling. Each
					finding links to its source and explains the problem. Checks based on LyricLint's own interpretation
					say so on their pages.
				</p>
				<p class="lp-prose">
					You make the judgement calls. Review the suggested edit and decide what fits the song.
				</p>
				<p class="lp-prose">
					<a href={resolve('/guidelines/')}>Read the transcription guide</a>
				</p>
			</div>
		</div>
	</section>

	<section class="lp-section">
		<div class="lp-container lp-split lp-split--flip">
			<div class="lp-panel">
				<div class="lp-panel__head">Local data</div>
				<ul class="lp-points">
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<CheckIcon size={12} weight="bold" />
						</span>
						<span
							><strong>No account needed.</strong> Check your lyrics without uploading them.</span
						>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<CheckIcon size={12} weight="bold" />
						</span>
						<span>
							<strong>Saved in your browser.</strong> Reopen the page to pick up your saved draft.
						</span>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<CheckIcon size={12} weight="bold" />
						</span>
						<span>
							<strong>Works offline once loaded.</strong> Keep editing and checking without a connection.
						</span>
					</li>
				</ul>
			</div>

			<div class="lp-split__copy">
				<h2>Your lyrics stay in your browser.</h2>
				<p class="lp-prose">
					Editing and checking happen on your device. Optional features can connect to other
					services when you choose to use them.
				</p>
				<p class="lp-prose">
					Play an audio file from your device without uploading it or storing a copy in the browser.
					YouTube, Spotify, and Apple Music load their own players and need an internet connection.
				</p>
				<p class="lp-prose">
					The rules assistant sends your question and recent chat messages to an answering service.
					It can read your draft only after you give permission for that draft. You can revoke
					access at any time. <a href={resolve('/privacy/')}>Read the privacy details</a>.
				</p>
			</div>
		</div>
	</section>

	<!-- The guidance catalog: the conventions themselves, not just the checks.
	     The evidence is a reproduction of three real entries: the convention as
	     an instruction, the form it wants over the form it corrects, and the
	     entry's standing, because the tier ladder is the thing this section has
	     to show that no other section has. Un-flipped, so the page's splits keep
	     alternating after the two flipped ones above it. -->
	<section class="lp-section">
		<div class="lp-container lp-split">
			<div class="lp-panel">
				<div class="lp-panel__head">Transcription guide</div>
				{#each guidelines as entry (entry.key)}
					<div class="lp-guideline">
						<span class="lp-guideline__title">{entry.title}</span>
						{#if entry.correct}
							<span class="lp-guideline__pair">
								<span class="lp-guideline__form">
									<span class="lp-guideline__mark lp-guideline__mark--correct" aria-hidden="true"
										>✓</span
									>
									<span class="sr-only">Correct:</span>
									<span class="lp-guideline__text">{entry.correct}</span>
								</span>
								{#if entry.incorrect}
									<span class="lp-guideline__form">
										<span class="lp-guideline__mark lp-guideline__mark--flagged" aria-hidden="true"
											>✕</span
										>
										<span class="sr-only">Flagged:</span>
										<span class="lp-guideline__text lp-guideline__text--flagged"
											>{entry.incorrect}</span
										>
									</span>
								{/if}
							</span>
						{/if}
						<span class="lp-guideline__meta">
							<AuthorityLadder authority={entry.authority} />
							<span>{authorityLabels[entry.authority]}</span>
						</span>
					</div>
				{/each}
			</div>

			<div class="lp-split__copy">
				<h2>The transcription guide in one place.</h2>
				<p class="lp-prose">
					Genius guidance is spread across staff guides, accepted annotations, and forum rulings. We
					bring it together in {guidanceCount} reviewed entries across {guidanceTopicCount} topics. Each
					entry explains a convention and links to its source. The guide also covers choices a linter
					cannot check.
				</p>
				<p class="lp-prose">
					Each entry shows who backs it. Staff guidance ranks first, followed by editor-reviewed
					annotations, then outside references and community writing. LyricLint's own preferences
					are clearly labelled. Entries link to any related checks, and those checks link back to
					the guide.
				</p>
				<p class="lp-prose">
					<a href={resolve('/guidelines/')}>Open the transcription guide</a>. You can read it
					without opening the workbench.
				</p>
			</div>
		</div>
	</section>

	<!-- What it is not, in the same run idiom as what it checks. Said plainly and
	     once, rather than as a list of caveats under the button. -->
	<section class="lp-section">
		<div class="lp-container">
			<div class="lp-head">
				<h2>What it is not.</h2>
			</div>

			<ul class="lp-run">
				<li>
					<span class="lp-run__title">Not a way to edit Genius</span>
					<p class="lp-run__body">Copy your finished text and paste it into Genius.</p>
				</li>
				<li>
					<span class="lp-run__title">Not an automated transcriber</span>
					<p class="lp-run__body">
						You write the lyrics. LyricLint checks them against reviewed rules. The optional AI
						assistant answers questions about the guidelines.
					</p>
				</li>
				<li>
					<span class="lp-run__title">Not a live scraper</span>
					<p class="lp-run__body">
						Reviewed rules come with the app. Checks do not fetch guidance from Genius while you
						work.
					</p>
				</li>
				<li>
					<span class="lp-run__title">Not a rewriter</span>
					<p class="lp-run__body">
						You choose which fixes to apply. LyricLint does not rewrite your lyrics on its own.
					</p>
				</li>
			</ul>
		</div>
	</section>

	<!-- The invitation comes after the argument and before the closing ask, as a
	     section of its own rather than a third button in the CTA pair: the CTA
	     answers "what do I do now" about the product, and this answers a
	     different question for a different reader. The Discord widget is the
	     section's evidence panel and carries the join action in its own footer,
	     so there is no separate join button beside the copy; the one button
	     opens the issues page (the door the copy itself argues for) while the
	     repository's own button stays with the closing CTA, so neither command
	     is offered twice. It is the bordered tier, not contrast: the page's
	     one contrast action is opening the workbench. -->
	<section class="lp-section">
		<div class="lp-container lp-split lp-split--flip">
			<!-- Discord's own server widget as the section's evidence panel,
			     beside the copy like the product shots above. First in the DOM so
			     it stacks above the copy on a narrow screen, flipped to the right
			     on a desktop. `allow="fullscreen"` is console hygiene: the
			     widget's script probes the Fullscreen permission on boot and Safari
			     logs the refusal as an error on every load. -->
			<iframe
				class="lp-join__widget"
				loading="lazy"
				src="https://discord.com/widget?id=1542181994174222356&theme=dark"
				title="LyricLint Discord server"
				width="350"
				height="500"
				allow="fullscreen"
				sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
			></iframe>

			<div class="lp-split__copy">
				<h2>Help make LyricLint better.</h2>
				<p class="lp-prose">
					LyricLint is open source. The code, rules, and demo scripts are all on GitHub. Open an
					issue to report a mistake or ask for a feature. Contributions of any size are welcome.
				</p>
				<p class="lp-prose">
					Join the Discord to discuss a guideline, ask a question, or talk about transcription.
				</p>
				<div class="lp-join">
					<a class="button" href="https://github.com/hkarlsen06/LyricLint/issues" rel="external">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
							/>
						</svg>
						<span>Open an issue</span>
					</a>
				</div>
			</div>
		</div>
	</section>

	<section class="lp-cta">
		<div class="lp-container">
			<h2>Submit it right the first time.</h2>
			<p>LyricLint is free and needs no account. Paste your lyrics and see what it finds.</p>
			<div class="lp-cta__actions">
				<a class="button button--contrast" href={resolve('/workbench/')}>
					<LyricIcon />
					<span>Open the workbench</span>
				</a>
				<a class="button" href="https://github.com/hkarlsen06/LyricLint" rel="external">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
						/>
					</svg>
					<span>Contribute on GitHub</span>
				</a>
			</div>
		</div>
	</section>
</main>

<style>
	/*
	 * The landing page.
	 *
	 * Everything else in this system is a tool: a compact UI ramp, two elevation
	 * levels, and a rule that a border has to be earning something. This page is
	 * the one surface that is not being operated, and it is laid out for a reader
	 * who has never heard of the product and will decide in one screen. So it keeps
	 * the system's material vocabulary (the same tokens, the same three button
	 * tiers, the same "a boundary separates something from something" test) and
	 * spends it on a wider ramp than the workbench has any use for.
	 *
	 * The composition is four moves, and each one is answering a way the previous
	 * version of this page failed:
	 *
	 * - **A claim at display size on bare canvas**, with the product shot directly
	 *   under it. The old hero held a screen with nothing on it but four small
	 *   centred elements and a promise that there was more below; the evidence for
	 *   the claim now arrives in the same screen as the claim.
	 * - **Section headings name their sections directly**, with no label, kicker,
	 *   or mono caps above them. A run of eyebrows was tried and removed: the
	 *   repo-wide rule stands here too, and a heading written as a sentence that
	 *   names its own subject skims as well as the rail of labels did.
	 * - **Runs of facts are one bordered object with hairlines inside it**, exactly
	 *   as the linter draws a run of diagnostics. Four separate cards with gaps
	 *   between them is four boundaries where the content only needed one.
	 * - **The measure stays narrow even though the page is wide.** The container is
	 *   `--measure-split` for structure; every paragraph inside it is still capped
	 *   at a reading measure, because a full-width line of body copy at this width
	 *   is unreadable no matter how good the section looks.
	 */

	.lp {
		/*
		 * The marketing display ramp, which is deliberately not the UI ramp.
		 *
		 * `--font-size-3xl` is the largest thing in the system and is sized for a
		 * headline sitting in a column of prose: it tops out at 2.5rem, which reads
		 * as a heading rather than as a claim when it is the only thing on a screen.
		 * These three steps exist for this page alone and are fluid for the reason
		 * that one is: a single size cannot serve a 320px phone and a monitor, and a
		 * breakpoint in the middle of a headline is a headline that jumps.
		 *
		 * Tracking is optical and therefore negative all the way up: the letter
		 * spacing that keeps 15px UI text legible reads as loose at 60px.
		 */
		--lp-display: clamp(2.5rem, 1.4rem + 4.8vw, 4.5rem);
		--lp-heading: clamp(1.75rem, 1.2rem + 2.2vw, 3rem);
		--lp-tracking: -0.032em;

		/* The band a section occupies, top and bottom, and the same at every section
		   so the page has one rhythm rather than a spacing decision per block. Two
		   of these meet between any two sections, which is what the ceiling is
		   sized against: past about 12rem of clear space the reader stops reading a
		   page and starts scrolling through separate ones. */
		--lp-band: clamp(var(--space-8), 8vw, calc(var(--space-8) * 2));
		--lp-hero-opening: clamp(var(--space-8), 9.5vw, calc(var(--space-7) * 3));
		--lp-shot-breath: clamp(var(--space-7), 5vw, var(--space-8));

		position: relative;
		/* Over the noise film, which is fixed at `--layer-editor-panel`. The page's
		   own overlays (the demo's diagnostic popover) sit above both. */
		z-index: var(--layer-editor-panel);
		width: 100%;
	}

	/* The structural width. Wider than any measure here, because what it is sizing
	   is an arrangement (a screenshot, a run of cells, two columns) rather than a
	   line of text. Every run of prose inside it caps itself again. */
	.lp-container {
		width: 100%;
		max-width: var(--measure-split);
		padding-inline: var(--space-5);
		margin-inline: auto;
	}

	.lp-section {
		padding-block: var(--lp-band);
	}

	.lp-head {
		margin: 0 0 var(--space-7);
	}

	/*
	 * The measure goes on the heading itself, not on the block around it.
	 *
	 * `ch` resolves against the element's own font, so a cap set on the wrapper is
	 * a cap in *body* text (about 400px), and the display-sized heading inside it
	 * then breaks into three short lines in a narrow column with half the page
	 * empty beside it. Set here it is 24 characters of the heading's own size,
	 * which is two lines at every width this page is read at.
	 */
	.lp-head h2 {
		max-width: 24ch;
		margin: 0 0 var(--space-4);
		font-size: var(--lp-heading);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--lp-tracking);
		line-height: 1.06;
		text-wrap: balance;
	}

	/* Body copy inside a section. Capped at the reading measure independently of
	   the container, which is the whole reason the two are separate. */
	.lp-prose {
		max-width: var(--measure-prose);
		margin: 0 0 var(--space-4);
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		line-height: var(--line-height-body);
	}

	.lp-prose:last-child {
		margin-bottom: 0;
	}

	/* The demo's own caption is written for a page whose body copy is capped at a
	   reading measure; dropped into this container it ran the full structural
	   width, which at 1440px is a single 1100px line of small muted type. It takes
	   the same measure as everything else here rather than growing one of its own. */
	.lp :global(.site-demo__hint) {
		max-width: var(--measure-prose);
	}

	.lp-prose strong {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	/*
	 * ── The hero ─────────────────────────────────────────────────────────────────
	 *
	 * It no longer reserves a screen and holds a peek under it. That arrangement
	 * was solving the problem that the evidence was below the fold; the product
	 * shot is *in* the hero now, so the first screen carries the claim and the
	 * proof together and there is nothing left to peek at.
	 */
	.lp-hero {
		position: relative;
		/* The claim gets a band of clear canvas above it before it speaks: the
		   reference composition spends ~120px there, and the difference between that
		   and a section's ordinary padding is the difference between a page opening
		   and a page continuing. */
		padding-block: var(--lp-hero-opening) var(--lp-band);
		/* The grid and the marks are absolutely placed against this box and are
		   allowed to run past its edges; nothing may leak sideways and give the page
		   a horizontal scroll. */
		overflow: hidden;
		text-align: center;
	}

	/*
	 * There is deliberately nothing behind the headline.
	 *
	 * The field behind the claim has been several things, each less than the last.
	 * A lit grid of hairlines (the reference composition's backdrop, and the
	 * backdrop of every dev-tool landing page of its generation) said
	 * infrastructure about a page that is about a song. Rows of the brand's
	 * waveform kept the template's texture with the shape swapped; ruled lines had
	 * already failed the same way. A radial amber wash was the last candidate and
	 * the same failure from the other side: glow-behind-a-headline is the other
	 * half of the template the grid came from. This design language is flat fills
	 * and hairlines with nothing atmospheric anywhere else in the system, so the
	 * hero is what the rest of the system is: the canvas, bare. The depth is
	 * carried by the content: the drifting corrections, and the shot below with
	 * the bloom that has a functional job.
	 */

	/*
	 * The corrections drifting over the canvas.
	 *
	 * They began as four chips of bare notation (the bracketed header, the ad-lib
	 * parentheses, the unknown-lyric marker, the performer tag), which was the
	 * reference composition's floating-logos gesture with the strings swapped. What
	 * floats now is the *action*: two chips, each holding a flagged form over the
	 * form the linter writes it as, with the editor's own wavy underline under the
	 * flagged one. Notation alone said what the tool is about; a correction says
	 * what the tool *does*, before a word of copy has been read, in the product's
	 * own visual language.
	 *
	 * The flagged line is muted and the fixed line carries the full text color,
	 * because the output is the thing being sold. The underline is the warning
	 * amber the editor draws it in. The squiggle is a shape cue, not a color one,
	 * and both chips are `aria-hidden` decoration: each correction is made again in
	 * prose and in the live demo further down, so nothing is carried by these
	 * alone.
	 */
	.lp-hero__float {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.lp-hero__mark {
		position: absolute;
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);
		font-family: var(--font-mono);
		font-size: var(--font-size-md);
		justify-items: start;
		line-height: 1.1;
		text-align: left;
		white-space: nowrap;
	}

	.lp-hero__flagged {
		color: var(--color-text-muted);
		text-decoration-color: var(--color-warning);
		text-decoration-line: underline;
		text-decoration-style: wavy;
		text-decoration-thickness: 0.07em;
		text-underline-offset: 0.24em;
	}

	.lp-hero__fixed {
		color: var(--color-text);
	}

	/*
	 * Two constraints decide these positions, and both are about what a chip must
	 * not land on.
	 *
	 * Sideways: the headline is centred and `balance`d, so its longest line reaches
	 * roughly the middle two thirds of the container at every width. The chips sit
	 * outside that band, and below `64rem` they are removed outright (see the media
	 * query at the foot of these styles) because there is no outside left.
	 *
	 * Downwards: the product shot occupies the bottom half of this section, and it
	 * is the evidence: nothing may drift over it. So the chips are confined to the
	 * top ~40%, which is the band holding the headline and the actions. Every
	 * string stays short for the sideways reason: a fifth mark reading
	 * `[Chorus: Avery & Blair]` was cut from the old set rather than repositioned,
	 * because the longest string is the one that reaches the words at one width and
	 * the screenshot at the next.
	 */
	.lp-hero__mark--header {
		top: 6%;
		left: 4%;
		rotate: -6deg;
	}

	.lp-hero__mark--adlib {
		top: 15%;
		right: 5%;
		rotate: 5deg;
	}

	/* The drift is one keyframe shared by both chips, offset so they are never in
	   step: two things moving together reads as the page scrolling rather than as
	   chips floating. Motion here answers nothing the reader did, so it goes
	   entirely under `prefers-reduced-motion`. */
	@media (prefers-reduced-motion: no-preference) {
		.lp-hero__mark {
			animation: lp-drift 9s var(--ease-out-quart) infinite;
		}

		.lp-hero__mark--adlib {
			animation-delay: -4.5s;
		}
	}

	@keyframes lp-drift {
		0%,
		100% {
			translate: 0 0;
		}

		50% {
			translate: 0 -12px;
		}
	}

	.lp-hero__inner {
		position: relative;
	}

	.lp-hero h1 {
		/* The measure is what does the work here, not the wrap: capped in `ch`, the
		   headline breaks into two or three lines of similar length at every width,
		   and `balance` evens out whatever is left. */
		max-width: 18ch;
		margin: 0 auto var(--space-5);
		font-size: var(--lp-display);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--lp-tracking);
		line-height: 1.03;
		text-wrap: balance;
	}

	.lp-hero__sub {
		max-width: 56ch;
		margin: 0 auto var(--space-6);
		color: var(--color-text-muted);
		font-size: clamp(var(--font-size-lg), 1.4vw, var(--font-size-xl));
		line-height: var(--line-height-body);
		text-wrap: pretty;
	}

	/* The guide sits below the workbench on the bordered tier. */
	.lp-hero__actions {
		/* A single centred grid column rather than a flex column: grid items
		   stretch to the column's width, so the two stacked buttons share the
		   widest one's box instead of each shrink-wrapping its own label: two
		   centred buttons of unequal width stacked on each other read as a row
		   that broke. */
		display: grid;
		gap: var(--space-4);
		justify-content: center;
	}

	.lp-cta__actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		justify-content: center;
	}

	/* The largest targets on the page and the only ones the reader came to press.
	   Same silhouette as every other button in the system, at the size this
	   surface calls for: a marketing page's one action is pressed from further
	   away than a toolbar's, so it steps past the control ramp's `lg`. */
	.lp-hero__actions .button,
	.lp-cta__actions .button {
		min-height: 3.25rem;
		padding-inline: var(--space-6);
		font-size: var(--font-size-lg);
		text-decoration: none;
	}

	/* Keep fact icons at their own scale inside the links. */
	.lp-hero .site-meta__fact svg {
		flex: none;
	}

	.lp-hero .site-meta {
		justify-content: center;
		margin: var(--space-5) 0 0;
	}

	/*
	 * ── The product shot ────────────────────────────────────────────────────────
	 *
	 * A picture of the workbench, flat on the page. It was tilted a couple of
	 * degrees back for a while (the screen-standing-in-space gesture every
	 * dev-tool hero of its generation opens with), and untilting it is a decision,
	 * not a loss of nerve: the site header is drawn at exactly the workbench
	 * toolbar's height so that arriving at the tool reads as the same window, and a
	 * screenshot hovering in perspective is the one element that undid that
	 * argument. A document meets the page the way a document does.
	 *
	 * Three things it depends on:
	 *
	 * - **The frame declares the image's aspect ratio and the image fills it.**
	 *   Without that the page reflows by several hundred pixels when the PNG
	 *   arrives, directly under the headline, which is the worst place on the site
	 *   for the layout to move.
	 * - **The border is inside the radius, drawn by the same element that clips.**
	 *   A wrapper with its own rounding one border-width outside a rounded child
	 *   leaves four corners where the child's curve falls outside the parent's, and
	 *   the surface spills through each of them. This is the same rule `.site-demo`
	 *   states at length: one element paints the border, the radius, the background
	 *   and the clip.
	 * - **The glow is behind it, not on it.** A shadow alone under a near-black
	 *   screenshot on a near-black page is invisible; what separates the two is a
	 *   soft bloom cast onto the page from behind the frame's own edges, which is
	 *   also what makes the shot read as lit. The bloom is the warning-soft amber
	 *   (the mark's hue, the same light the waveform above sheds) where it used to
	 *   be the accent's blue-on-dark, which lit the evidence in a color the brand
	 *   never claimed.
	 */
	.lp-shot {
		position: relative;
		max-width: 74rem;
		margin: var(--lp-shot-breath) auto 0;
	}

	.lp-shot::before {
		position: absolute;
		background: radial-gradient(60% 50% at 50% 40%, var(--color-warning-soft), transparent 70%);
		content: '';
		filter: blur(48px);
		inset: -6% -4% -10%;
		opacity: 0.55;
		pointer-events: none;
	}

	.lp-shot__frame {
		container-type: inline-size;
		position: relative;
		display: block;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-lg);
		background: var(--color-canvas);
		box-shadow: var(--shadow-overlay);
		overflow: hidden;
	}

	.lp-shot__media {
		position: relative;
	}

	.lp-shot__frame img,
	.lp-shot__frame video {
		display: block;
		width: 100%;
		height: auto;
	}

	/* The responsive still owns the poster; a native video poster would request
	   the full-size source too. Keep it above the media until `autoplayInView`
	   marks a decoded frame paintable. The video alone reserves the geometry. */
	.lp-shot__frame .lp-shot__poster {
		position: absolute;
		z-index: 1;
		inset: 0;
		height: 100%;
		object-fit: cover;
		opacity: 1;
		pointer-events: none;
	}

	.lp-shot__frame:global([data-video-ready]) .lp-shot__poster {
		opacity: 0;
	}

	@media (prefers-reduced-motion: no-preference) {
		.lp-shot__poster {
			transition: opacity var(--duration-fast) var(--ease-out-quart);
		}
	}

	/*
	 * A detail shot inside a section: the same frame as the hero's, with the bloom
	 * turned down, so the picture reads as evidence in the argument rather than as
	 * a second hero. It is left-aligned with the prose it follows, because this
	 * section is not centred.
	 */
	.lp-shot--detail {
		max-width: 56rem;
		margin: var(--space-7) 0 0;
	}

	/* Beside copy in a split, the column already places it: the margin above is
	   for the standalone form, under a run of prose. */
	.lp-split .lp-shot--detail {
		margin: 0;
	}

	/* A single metadata panel needs less magnification than the editor shots. */
	.lp-shot--song {
		width: 100%;
		max-width: 26rem;
		justify-self: center;
	}

	.lp-shot--detail::before {
		opacity: 0.3;
	}

	/*
	 * ── A run of cells ──────────────────────────────────────────────────────────
	 *
	 * One border around the run and hairlines between the members, which is how the
	 * linter draws a run of diagnostics and for the same reason: the run is what is
	 * being separated from the page, and the members are separated from each other
	 * by the line where they meet. Four bordered cards with gaps between them would
	 * be four boundaries doing one boundary's job.
	 */
	.lp-run {
		display: grid;
		padding: 0;
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		margin: 0;
		background: var(--color-surface);
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		list-style: none;
		overflow: hidden;
	}

	.lp-run > li {
		display: grid;
		padding: var(--space-5);
		gap: var(--space-2);
		align-content: start;
		/* The hairline is on every cell's start edges and the run clips, so the ones
		   that land on the outside are cut off by `overflow: hidden` rather than
		   having to be selected away, which is what makes this correct at any
		   column count `auto-fit` happens to resolve to. */
		box-shadow:
			calc(-1 * var(--border-width)) 0 0 var(--color-border),
			0 calc(-1 * var(--border-width)) 0 var(--color-border);
	}

	.lp-run__title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.lp-run__body {
		margin: 0;
		color: var(--color-text-muted);
		line-height: var(--line-height-body);
	}

	/* The community section's action row under its copy. The Discord widget
	   beside it carries the join action in its own footer, so the row holds only
	   the repository button, bordered tier, because the page's one contrast
	   action is opening the workbench. It stays a wrapping flex row so a second
	   door can rejoin it without relayout. */
	.lp-join {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-top: var(--space-5);
	}

	.lp-join .button {
		text-decoration: none;
	}

	/* Experiment: the embedded Discord widget as the community section's evidence
	   panel, beside the copy the way the product shots sit in their splits. It
	   fills its column's width; the height is the widget's own. */
	.lp-join__widget {
		display: block;
		width: 100%;
		border: none;
		border-radius: var(--radius-lg);
	}

	/*
	 * ── Two columns ─────────────────────────────────────────────────────────────
	 *
	 * A panel of evidence beside the copy explaining it. The copy is second in the
	 * DOM on purpose: on a narrow screen the columns stack and the explanation
	 * should arrive under the thing it explains, not above it.
	 */
	.lp-split {
		display: grid;
		gap: clamp(var(--space-6), 4vw, var(--space-8));
		align-items: center;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
	}

	/* The interactive demo can grow as lyrics wrap or are edited. Keep the
	   heading and editor anchored at the top instead of recentering the copy. */
	.lp-demo {
		align-items: start;
	}

	.lp-demo :global(.site-demo) {
		margin-bottom: 0;
	}

	.lp-shot__caption {
		margin: var(--space-3) 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}

	.lp-player__keys {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-5);
	}

	.lp-player kbd {
		color: var(--color-text);
	}

	/*
	 * Flipped, the copy leads and the evidence sits to its right. The page's five
	 * splits alternate: evidence left, picture left, two flipped, then the
	 * guidelines panel back on the left, so a reader scrolling meets the panels on
	 * both sides rather than a single rail of them. The flip is visual only: the evidence stays first in
	 * the DOM, so when the columns stack on a narrow screen it still arrives above
	 * the copy that explains it, and the order is reset in the stack's own media
	 * query below.
	 */
	.lp-split--flip {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
	}

	.lp-split--flip > :global(:first-child) {
		order: 2;
	}

	.lp-split__copy h2 {
		max-width: 20ch;
		margin: 0 0 var(--space-4);
		font-size: var(--lp-heading);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--lp-tracking);
		line-height: 1.06;
		text-wrap: balance;
	}

	/*
	 * A quiet panel. It earns its border the way `.site-sample` does: it holds a
	 * different material from the prose beside it, either a verbatim piece of a
	 * document or a reproduction of one of the workbench's own surfaces, and it is
	 * never nested inside anything else that has one.
	 */
	/*
	 * Two things here are load-bearing, and both are `<figure>` and `<pre>` behaving
	 * exactly as the UA stylesheet says they should.
	 *
	 * `margin: 0` cancels the UA's `figure { margin: 1em 40px }`. Left standing, a
	 * panel that is a figure sits 40px inside a panel that is a div, so the two
	 * forms of this component do not line up with each other or with the prose
	 * either side of them.
	 *
	 * `grid-template-columns: minmax(0, 1fr)` is what keeps a `white-space: pre`
	 * body from widening the entire page. A block in normal flow contributes its
	 * *min-content* width to its parent, and the min-content of preformatted text is
	 * its longest line, so the sample of copied-out markup propagated a ~570px
	 * floor all the way up through `.lp-container` and `main` to `.site`, and every
	 * section on the page laid out 180px wider than a 390px phone. The `overflow-x:
	 * auto` on the body did not save it: a scroll container still reports that
	 * min-content in block flow. As a grid item its automatic minimum size is zero
	 * instead, so the body takes the column it is given and scrolls inside it, which
	 * is what the `auto` was always for.
	 */
	.lp-panel {
		display: grid;
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		margin: 0;
		background: var(--color-surface);
		grid-template-columns: minmax(0, 1fr);
		overflow: hidden;
	}

	/* The panel's own strip, in the idiom the workbench uses for a header over a
	   run: chrome, a hairline under it, and a mono label that names what is below
	   rather than describing it. */
	.lp-panel__head {
		display: flex;
		padding: var(--space-2-5) var(--space-4);
		border-bottom: var(--border-width) solid var(--color-border);
		gap: var(--space-2);
		align-items: center;
		background: var(--color-chrome);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size: var(--font-size-2xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* The same inset run as Review: resting findings sit directly on chrome and
	   separate by space. The shared diagnostic classes and SeverityTag own the
	   meta line so its glyph, spacing, and accessible severity cannot drift. */
	.lp-finding-list {
		display: grid;
		padding: var(--space-2) var(--space-3);
		gap: var(--space-2);
		background: var(--color-chrome);
	}

	.lp-finding {
		display: grid;
		padding: var(--space-3) var(--space-4);
		gap: var(--space-1);
		border-radius: var(--radius-panel);
	}

	.lp-finding__message {
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	/*
	 * A reproduction of a guidance entry, the way `.lp-finding` reproduces the
	 * diagnostic card's meta line: the convention as an instruction, the form it
	 * wants over the form it corrects, and the entry's standing underneath.
	 * Markup rather than a screenshot so it stays legible at any width and in the
	 * accessible tree: the verdict marks are `aria-hidden` with `sr-only` labels
	 * beside them, and the flagged form is struck through as well as marked,
	 * because colour is never the only cue.
	 */
	.lp-guideline {
		display: grid;
		padding: var(--space-4);
		gap: var(--space-2);
	}

	/* Between rows only: the panel's head already rules its own bottom edge, and
	   a border on every row would double that hairline. */
	.lp-guideline + .lp-guideline {
		border-top: var(--border-width) solid var(--color-border);
	}

	.lp-guideline__title {
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.lp-guideline__pair {
		display: grid;
		gap: var(--space-1);
	}

	.lp-guideline__form {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
	}

	.lp-guideline__mark {
		flex: none;
	}

	.lp-guideline__mark--correct {
		color: var(--color-success);
	}

	.lp-guideline__mark--flagged {
		color: var(--color-danger);
	}

	.lp-guideline__text--flagged {
		text-decoration: line-through;
	}

	/* The ladder itself is `.site-ladder` (`AuthorityLadder.svelte`), shared with
	   the guidance topic pages this panel reproduces. */
	.lp-guideline__meta {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	/*
	 * A list of claims with a mark against each. The mark is a small accent-tinted
	 * chip rather than a bullet, because these are the page's summary of what it
	 * has already argued and want to read as a checklist.
	 */
	.lp-points {
		display: grid;
		padding: 0;
		gap: var(--space-4);
		margin: 0;
		list-style: none;
	}

	/* Inside a panel the list is the panel's whole body, so it takes the inset the
	   body would have had: the panel's head already draws the boundary and a
	   second box around the list would be the nesting this system forbids. */
	.lp-panel .lp-points {
		padding: var(--space-5);
	}

	.lp-points li {
		display: grid;
		gap: var(--space-3);
		align-items: start;
		color: var(--color-text-muted);
		grid-template-columns: auto minmax(0, 1fr);
		line-height: var(--line-height-body);
	}

	.lp-points strong {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	.lp-points__mark {
		--point-mark-size: calc(var(--space-5) - var(--space-0-5));
		display: grid;
		width: var(--point-mark-size);
		height: var(--point-mark-size);
		border: var(--border-width) solid
			color-mix(in oklch, var(--color-accent) 30%, var(--color-border));
		border-radius: var(--radius-sm);
		/* Center on the first line, including when the prose wraps below it. */
		margin-top: max(0px, calc((1lh - var(--point-mark-size)) / 2));
		background: var(--color-accent-soft);
		color: var(--color-accent);
		place-items: center;
	}

	/*
	 * ── The closing action ──────────────────────────────────────────────────────
	 *
	 * The same claim the hero makes, at the moment the reader has finished the
	 * argument for it. It repeats the hero's display size deliberately: a page that
	 * ends in a small heading ends by trailing off.
	 */
	.lp-cta {
		padding-block: var(--lp-band);
		border-top: var(--border-width) solid var(--color-border);
		text-align: center;
	}

	.lp-cta h2 {
		max-width: 20ch;
		margin: 0 auto var(--space-5);
		font-size: var(--lp-display);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--lp-tracking);
		line-height: 1.03;
		text-wrap: balance;
	}

	.lp-cta p {
		max-width: 52ch;
		margin: 0 auto var(--space-6);
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		line-height: var(--line-height-body);
	}

	/* ── Narrower screens ───────────────────────────────────────────────────────*/

	@media (max-width: 64rem) {
		/* The columns stack, so `align-items: center` has nothing left to centre and
		   the panel would sit in the middle of a column it now spans. The flip comes
		   off with them: stacked, the evidence leads again in DOM order. */
		.lp-split {
			align-items: start;
			grid-template-columns: minmax(0, 1fr);
		}

		.lp-split--flip > :global(:first-child) {
			order: 0;
		}

		/*
		 * The floating marks go entirely, and this is the width they have to go at.
		 * They are placed in the container's outer margins, which is the only band
		 * the centred headline never reaches. Below this the headline takes the
		 * full width and there is no outer margin left, so every mark would land on
		 * the words it is decorating.
		 */
		.lp-hero__float {
			display: none;
		}
	}

	@media (max-width: 32rem) {
		/* Two centred buttons of unequal width stacked on each other read as a row
		   that broke rather than as a column that was meant. Below the width where
		   they stop fitting they are a column on purpose, at one width, which is
		   also the larger touch target. The hero's actions are already a column at
		   every width, so only the closing pair changes here. */
		.lp-cta__actions {
			flex-direction: column;
			align-items: stretch;
		}

		.lp-container {
			padding-inline: var(--space-5);
		}
	}
</style>
