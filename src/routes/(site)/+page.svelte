<script lang="ts">
	import shotDimensions from '$lib/assets/shot-dimensions.json';
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { BookOpen, Check } from 'lucide-svelte';
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import { authorityLabels, type GuidanceAuthority } from '$lib/guidance/guidance.js';
	import { maintainerStructuredData, siteUrl } from '$lib/seo.js';
	import AuthorityLadder from '$lib/ui/site/AuthorityLadder.svelte';
	import LazyLiveDemo from '$lib/ui/site/LazyLiveDemo.svelte';
	import LyricIcon from '$lib/ui/site/LyricIcon.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	/*
	 * A section's loop plays as an enhancement, never as the markup's own state.
	 * There is no `autoplay` attribute, so a reader with no JavaScript gets frame
	 * one — the state the loop opens on, which is the same thing the still it
	 * replaced used to say — rather than a section that starts halfway through
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
	 * the picture it carried before any of this — so the argument is made either
	 * way and only the medium changes.
	 *
	 * It is an **attachment** rather than one bound element and an `onMount`,
	 * because there are two of these now and there will not always be two. A
	 * rule written per video is a rule that gets copied, and the copy that
	 * drifted would be the one nobody is scrolled to.
	 */
	const autoplayInView: Attachment<HTMLVideoElement> = (video) => {
		if (prefersReducedMotion()) return;

		const frame = video.parentElement;
		const poster = frame?.querySelector<HTMLImageElement>('.lp-shot__poster');
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
					video.currentTime = 0;
					// A browser may refuse to start even a muted video, and the refusal is
					// nothing to act on: what is behind it is frame one, which is a
					// complete answer on its own.
					void video.play().catch(() => undefined);
				});
			},
			// Enough of the frame showing that the reader is looking at it rather
			// than passing it — these shots are tall, so a threshold on their own
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
	// The `WebSite` node is what Google's site-name feature reads — without it,
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
	// the linter writes. They used to be four scattered chips of bare notation —
	// which was the reference composition's floating-logos gesture with the
	// content swapped; showing the *fix* instead is the one thing this product
	// does that a logo cloud cannot, and it puts the editor's own wavy underline
	// on the first screen.
	//
	// Decorative and `aria-hidden`: both corrections are made again in prose and
	// in the demo further down, so nothing is carried by these alone. Every
	// string is short, which is a constraint rather than a coincidence — see the
	// note above their positions in `landing.css`.
	const marks = [
		{ key: 'header', flagged: 'Verse 1:', fixed: '[Verse 1]' },
		{ key: 'adlib', flagged: '(yeah)', fixed: '(Yeah)' }
	];

	/*
	 * Three real entries from the guidance catalog, one per tier the catalog
	 * currently holds, reproduced as markup rather than screenshotted for the
	 * linter panel's reason: legible at any width and in the accessible tree.
	 * The titles quote `src/lib/guidance/entries.ts`, so a reworded entry means
	 * re-quoting it here — grep for the title. The tier label and its ladder
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

			<!-- The workbench keeps the page's one contrast action; the Discord
			     invite sits under it on the bordered tier, the community door
			     promoted into the hero at the maintainer's call. The rules are a
			     step away as the fact line's first entry rather than a link of
			     their own between the buttons and the facts. -->
			<div class="lp-hero__actions">
				<a class="button button--contrast" href={resolve('/workbench/')}>
					<LyricIcon />
					<span>Open the workbench</span>
				</a>
				<a
					class="button lp-hero__discord"
					href="https://discord.gg/5mnSnUhtt8"
					rel="external noopener"
					target="_blank"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
						/>
					</svg>
					<span>Join the Discord</span>
					<span class="sr-only">(opens in a new tab)</span>
				</a>
			</div>

			<!-- The quiet line under the buttons: the way to the transcription guide, which
			     gave the Discord invite its old slot above, and the repository.
			     The privacy claim has a section of its own below and the footer of
			     every page carries it. -->
			<p class="site-meta">
				<a class="site-meta__fact site-meta__link" href={resolve('/guidelines/')}>
					<!-- The mark names the destination the way the octocat names
					     GitHub: the guide is a book, in the link's own ink. -->
					<BookOpen aria-hidden="true" size={14} strokeWidth={2.25} />
					<span>Read the transcription guide</span>
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

			<!-- Filmed by `scripts/render-motion.mjs --hero`, which drives the real
			     workbench in a real browser; the poster is the same scene's still
			     from `render-workbench-shot.mjs`, which is to say frame one.

			     **A still could show a workbench with findings in it. It could not
			     show the panel emptying**, which is the one thing a reader wants to
			     know before pasting a transcription into a stranger's website — so
			     the hero is the whole run: every safe fix in one press, then card
			     after card, then the two choruses linked so each later fix lands in
			     both at once, then nothing left to report. It rewinds by holding
			     the toolbar's own Undo rather than cutting, because a cut is one
			     frame where a finished song becomes a broken one, which reads as
			     the video having been edited in a picture whose whole argument is
			     that nothing here is staged.

			     The responsive image carries frame one at the video's exact ratio.
			     It stays above the video until a decoded frame can replace it. There
			     is no native poster: that would download the full-size image as well
			     as the responsive candidate. `preload="none"` leaves playback to the
			     observer; without JavaScript or with reduced motion the still stays. -->
			<div class="lp-shot">
				<div class="lp-shot__frame">
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
						width={shotDimensions['workbench.webm'].width}
						height={shotDimensions['workbench.webm'].height}
						aria-label="The workbench checks a transcription with Avery and Blair marked in colour. Five fixes are applied at once, followed by individual fixes. The two choruses are linked so later edits update both. The findings clear, then the document rewinds."
						loop
						muted
						playsinline
						preload="none"
					>
						<source
							src="{resolve('/')}workbench-mobile.webm"
							type="video/webm"
							media="(max-width: 30rem)"
						/>
						<source src="{resolve('/')}workbench.webm" type="video/webm" />
					</video>
				</div>
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
					     controls, so what is left — an embedded object with an
					     accessible name — is the honest description of it. -->
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
			     stop there; what the loop adds is the press — that the button beside
			     the explanation does what the explanation says.

			     The video reserves its actual 1026×586 ratio. The lazy overlaid image
			     keeps the opening finding visible before playback, including without
			     JavaScript, without setting the video's intrinsic geometry. -->
			<div class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-harper.webp"
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
							<Check size={12} strokeWidth={3.3} />
						</span>
						<span
							><strong>No account needed.</strong> Check your lyrics without uploading them.</span
						>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<Check size={12} strokeWidth={3.3} />
						</span>
						<span>
							<strong>Saved in your browser.</strong> Reopen the page to pick up your saved draft.
						</span>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<Check size={12} strokeWidth={3.3} />
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
	     The evidence is a reproduction of three real entries — the convention as
	     an instruction, the form it wants over the form it corrects, and the
	     entry's standing — because the tier ladder is the thing this section has
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
	     opens the issues page — the door the copy itself argues for — while the
	     repository's own button stays with the closing CTA, so neither command
	     is offered twice. It is the bordered tier, not contrast — the page's
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
