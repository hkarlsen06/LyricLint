<script lang="ts">
	import { BookOpen, Check } from 'lucide-svelte';
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import { authorityLabels, type GuidanceAuthority } from '$lib/guidance/guidance.js';
	import { siteUrl } from '$lib/seo.js';
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
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
		// already requested as native posters, so this normally resolves from the
		// shared cache and does not hold up the video request.
		const posterReady = poster?.decode().catch(() => undefined) ?? Promise.resolve();
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
				void posterReady.then(() => {
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
	const pageDescription = $derived(
		`A free lyric formatter and checker for Genius transcriptions: ${ruleCount} reviewed formatting rules plus local grammar and spelling checks for section headers, performer markup, punctuation, and more. Runs in your browser.`
	);
	const socialDescription =
		'Paste a transcription, see every formatting problem with the Genius source that backs it, and copy clean markup. Your lyrics stay in your browser.';
	const canonicalUrl = siteUrl('/');
	const appUrl = siteUrl('/lint/');
	const harperUrl = $derived(data.harperUrl);
	// The `WebSite` node is what Google's site-name feature reads — without it,
	// results print the bare domain where the brand should be. It belongs on the
	// homepage and only the homepage, which is where Google looks for it.
	const websiteData = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'LyricLint',
		url: canonicalUrl
	};
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'LyricLint',
		url: appUrl,
		description: pageDescription,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires a desktop or laptop web browser',
		offers: {
			'@type': 'Offer',
			price: 0,
			priceCurrency: 'USD'
		}
	});

	// Deliberately invented lines, not a real song. The page needs a transcription
	// that is wrong in several ordinary ways at once — a written-out label instead
	// of a header, a typewriter apostrophe, a lowercase line start, a trailing
	// comma, a bare ad-lib — and inventing them is also the only way to show a
	// lyric here at all.
	const messy = `Verse 1:
i has counted every streetlight on the way
you said we'd drive until the radio gave out, yeah
and the "quiet" part was never really quiet`;

	const clean = `[Verse 1]
I have counted every streetlight on the way
You said we'd drive until the radio gave out (Yeah)
And the "quiet" part was never really quiet`;

	// The notation itself, floating over the hero. t3.codes floats the logos of
	// the agents it orchestrates; this product integrates with nothing, so the
	// equivalent is the marks a transcriber actually types — a bracketed header,
	// a performer tag, the unknown-lyric marker, an ad-lib.
	//
	// Decorative and `aria-hidden`: every one of them is explained in prose
	// further down, so nothing is carried by these alone. They are also all
	// short, which is a constraint rather than a coincidence — see the note above
	// their positions in `landing.css`.
	const marks = [
		{ key: 'verse', text: '[Verse 1]' },
		{ key: 'voice', text: '<i>Blair</i>' },
		{ key: 'unknown', text: '[?]' },
		{ key: 'adlib', text: '(Yeah)' }
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
		<div class="lp-hero__grid" aria-hidden="true"></div>

		<div class="lp-hero__float" aria-hidden="true">
			{#each marks as mark (mark.key)}
				<span class="lp-hero__mark lp-hero__mark--{mark.key}">{mark.text}</span>
			{/each}
		</div>

		<div class="lp-container lp-hero__inner">
			<h1>Catch Genius formatting problems before you submit.</h1>

			<p class="lp-hero__sub">
				Paste a transcription and see every formatting problem — each one with the Genius guideline
				behind it.
			</p>

			<!-- One button, and the rules as a quiet link under it rather than a
			     second button beside it — see `.lp-hero__actions` in landing.css.
			     The closing CTA offers both as buttons, after the argument. -->
			<div class="lp-hero__actions">
				<a class="button button--contrast" href={resolve('/lint/')}>
					<LyricIcon />
					<span>Open the workbench</span>
				</a>
				<a class="lp-hero__alt" href={resolve('/guidelines/')}>
					<!-- The mark names the destination the way t3's octocat names
					     GitHub: the guide is a book, in the link's own ink. -->
					<BookOpen aria-hidden="true" size={15} strokeWidth={2.25} />
					<span>Go to the Guidelines</span>
				</a>
			</div>

			<!-- What it costs and what it needs, as a specification rather than as
			     two sentences of apology under the button. Two facts and no more:
			     the privacy claim has a section of its own below and the footer of
			     every page carries it. -->
			<p class="site-meta">
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
				<span class="site-meta__fact">
					<span class="site-meta__separator" aria-hidden="true">·</span>On device
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

			     **This one keeps its `poster`, and the performer loop's rule is why
			     rather than an exception to it.** What that rule is actually about
			     is two media of *different* framings sharing one slot: a `<video>`
			     takes its intrinsic ratio from the poster until metadata arrives
			     and from the media afterwards, so a 1094×1574 still under a
			     1226×1572 loop resized the box mid-load. Here the two are the same
			     scene at the same crop — 2560×1640 both, because the loop's frame
			     one *is* the still — so there is no ratio to disagree about and
			     nothing shifts.

			     Which makes the poster worth having, because this slot is the
			     page's visual evidence: the WebP still is 152KB, the loop is
			     ~2.6MB, and posting the former means the first screen paints
			     without waiting on the latter. `preload="metadata"` keeps the video
			     out of that race; `autoplayInView` starts it when it is ready. It
			     is also the whole no-JavaScript and reduced-motion story — both
			     leave the poster up, which is exactly the picture this section
			     carried before it moved. -->
			<div class="lp-shot">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench.webp"
						width="2560"
						height="1640"
						alt=""
						aria-hidden="true"
					/>
					<!-- Named by `aria-label` for the reason the performer loop is, and
					     deliberately not `role="img"`, which the platform refuses on a
					     `<video>`. -->
					<video
						{@attach autoplayInView}
						src="{resolve('/')}workbench.webm"
						poster="{resolve('/')}workbench.webp"
						width="2560"
						height="1640"
						aria-label="The LyricLint workbench working through a transcription: Avery and Blair colour-tagged through Verse 2, and a linter panel of sourced findings that empties as each card's fix is pressed — five at once from the bulk strip, then one at a time, with the song's two choruses linked partway through so every later correction lands in both. The document ends clean, then rewinds to where it started."
						loop
						muted
						playsinline
						preload="metadata"
					></video>
				</div>
			</div>
		</div>
	</section>

	<!-- The demo is the product, not a picture of it: the same editor, the same
	     rule set, the same cards. It reads its findings back afterwards rather
	     than introducing them with a colon, so the section leads with the thing
	     worth looking at. -->
	<section class="lp-section">
		<div class="lp-container">
			<div class="lp-head">
				<h2>This is the real editor, running on this page.</h2>
				<p>
					Not a screenshot and not a video. Hover an underline for the finding, the guideline behind
					it, and the fix — or type into it and see what else it catches.
				</p>
			</div>

			<LazyLiveDemo text={messy} performerNames={['Avery', 'Blair']} />

			<p class="lp-prose">
				That transcription has a written-out section header, a lowercase line start, a subject and
				verb that disagree, a stray comma, and an ad-lib nobody parenthesised.
			</p>

			<p class="lp-prose">
				Apply the fixes it offers and you are left with the document you meant to submit — the same
				plain text and literal Genius markup you would have typed by hand.
			</p>

			<figure class="lp-panel">
				<figcaption class="lp-panel__head">What you copy out</figcaption>
				<pre class="lp-panel__body">{clean}</pre>
			</figure>
		</div>
	</section>

	<!-- One bordered run with hairlines between the members, the way the linter
	     draws a run of diagnostics. Four separate cards with gaps between them
	     would be four boundaries doing one boundary's job. -->
	<section class="lp-section">
		<div class="lp-container">
			<div class="lp-head">
				<h2>{ruleCount} reviewed rules, and the judgement calls stay yours.</h2>
				<p>
					Every rule required an exact source URL, a written interpretation, a human review, and a
					last-verified date before it was allowed to ship. Genius conventions cite the guideline's
					own annotation; spellings cite the language authorities that correct them; and where a
					check is our own reading of the sources, its page says so.
				</p>
			</div>

			<ul class="lp-run">
				<li>
					<span class="lp-run__mark" aria-hidden="true">[ ]</span>
					<span class="lp-run__title">Section headers</span>
					<p class="lp-run__body">
						Bracketed song parts, recognised names, verse numbering, and the repeats that should be
						one chorus rather than three copies of it.
					</p>
				</li>
				<li>
					<span class="lp-run__mark" aria-hidden="true">&lt;i&gt;</span>
					<span class="lp-run__title">Performer markup</span>
					<p class="lp-run__body">
						Literal HTML that has to balance, use its style slots in a consistent order, and agree
						with the legend in the header above it.
					</p>
				</li>
				<li>
					<span class="lp-run__mark" aria-hidden="true">&rsquo;</span>
					<span class="lp-run__title">Punctuation and spelling</span>
					<p class="lp-run__body">
						Typewriter quotes, missing contraction apostrophes, reviewed Genius spellings, censored
						masks, and invisible whitespace.
					</p>
				</li>
				<li>
					<span class="lp-run__mark" aria-hidden="true">&#9888;</span>
					<span class="lp-run__title">Calls you have to make</span>
					<p class="lp-run__body">
						Where a convention is genuinely contextual, the finding says so and its fix is previewed
						for you to confirm instead of applied.
					</p>
				</li>
			</ul>

			<p class="lp-note">
				<span class="lp-note__item">
					<Check aria-hidden="true" size={14} strokeWidth={3} />
					Sourced, versioned, and bundled with the app
				</span>
				<span class="lp-note__item">
					<Check aria-hidden="true" size={14} strokeWidth={3} />
					Never a live scraper
				</span>
				<span class="lp-note__item">
					<Check aria-hidden="true" size={14} strokeWidth={3} />
					Nothing changes unless you press the control that changes it
				</span>
			</p>
		</div>
	</section>

	<!-- The evidence first and the explanation under it, which is also the order
	     they stack in when the columns collapse. -->
	<section class="lp-section">
		<div class="lp-container lp-split">
			<div class="lp-panel">
				<div class="lp-panel__head">Linter</div>
				<div class="lp-finding">
					<span class="lp-finding__message">Write this section header as [Verse 1].</span>
					<span class="lp-finding__meta">
						<span class="lp-finding__severity" aria-hidden="true">&#9888;</span>
						<span>Warning</span>
						<span class="lp-finding__separator" aria-hidden="true">·</span>
						<span>Line 1</span>
						<span class="lp-finding__separator" aria-hidden="true">·</span>
						<a href={resolve('/rules/')}>How to Add Songs to Genius</a>
					</span>
				</div>
				<div class="lp-finding">
					<span class="lp-finding__message">This likely ad-lib may need parentheses.</span>
					<span class="lp-finding__meta">
						<span class="lp-finding__severity" aria-hidden="true">&#9432;</span>
						<span>Suggestion</span>
						<span class="lp-finding__separator" aria-hidden="true">·</span>
						<span>Line 3</span>
						<span class="lp-finding__separator" aria-hidden="true">·</span>
						<a href={resolve('/rules/')}>Ad-libs</a>
					</span>
				</div>
			</div>

			<div class="lp-split__copy">
				<h2>Every warning carries its source.</h2>
				<p class="lp-prose">
					A linter that cannot say why it is complaining is just an opinion with a red underline.
					Each finding links to the guideline it came from, so you can check the ruling rather than
					take it.
				</p>
				<p class="lp-prose">
					<a href={resolve('/rules/')}>Read the full rule reference</a>, including the sources
					behind each one.
				</p>
			</div>
		</div>
	</section>

	<section class="lp-section">
		<div class="lp-container lp-split">
			<!-- Generated by `scripts/render-performer-motion.mjs`: the real editor,
			     driven by a real browser, filmed one frame at a time. The poster is
			     frame one extracted from that loop, so it has the exact same crop and
			     aspect ratio rather than merely depicting the same scene.

			     A still could only assert that the markup is never typed; the loop
			     shows the pointer dragging a phrase and pressing two names, which is
			     this section's entire claim.

			     The older still was framed differently: 1094×1574 against the loop's
			     1226×1572. A `<video>` takes its intrinsic ratio from the poster until
			     metadata arrives and from the media afterwards, so putting those two
			     assets in one slot resized the column mid-load. The extracted WebP is
			     1226×1572 too, and the attributes state that same ratio before either
			     asset arrives.

			     `preload="none"` keeps the 312KB loop out of the first navigation;
			     `autoplayInView` starts it when this section is actually being read.
			     The 80KB poster carries frame one until then, including without
			     JavaScript, without giving the box a second geometry. -->
			<div class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-performers.webp"
						width="1226"
						height="1572"
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
						poster="{resolve('/')}workbench-performers.webp"
						width="1226"
						height="1572"
						aria-label="A whole transcription in the editor. Part of a lyric line is selected with a drag, and the performer picker opens asking who sings it: Avery is chosen for that phrase, then both Avery and Blair together for the rest of the section. Applying writes the section header's legend and wraps the phrase in italics markup, and both performers' colours run down the gutter beside the lines they share."
						loop
						muted
						playsinline
						preload="none"
					></video>
				</div>
			</div>

			<div class="lp-split__copy">
				<h2>Credit a voice by selecting it, not by writing the HTML.</h2>

				<p class="lp-prose">
					Marking up who sings what is the part of a Genius transcription that costs the most and
					goes wrong the most: the markup is literal HTML, it has to be balanced, the style slots
					have to be used in a consistent order, and the section header's legend has to agree with
					every span underneath it — all of it typed by hand, in a plain textarea, one
					<code class="site-code">&lt;i&gt;</code> at a time.
				</p>

				<p class="lp-prose">
					LyricLint does it as a selection. Select the words and choose the voice, then the section
					header gets updated as one edit you can undo in one press. Every performer keeps a colour,
					so you can see who is singing each passage at a glance — and <strong
						>the colour is display only</strong
					>. It never reaches the markup you copy out, which stays exactly what Genius expects.
				</p>

				<p class="lp-prose">
					The demo above has two performers on its roster already. Select any part of a line and
					hand it to one of them — after you've fixed the header.
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

			     Its poster is frame one extracted from the video, so both sides of
			     metadata loading have the stated 1044×570 ratio. `preload="none"`
			     leaves the 96KB loop out of the landing waterfall until the observer
			     sees this section; the 20KB poster keeps its opening finding visible
			     before then and when JavaScript is unavailable. -->
			<div class="lp-shot lp-shot--detail">
				<div class="lp-shot__frame">
					<img
						class="lp-shot__poster"
						src="{resolve('/')}workbench-harper.webp"
						width="1044"
						height="570"
						alt=""
						aria-hidden="true"
					/>
					<video
						{@attach autoplayInView}
						src="{resolve('/')}workbench-harper.webm"
						poster="{resolve('/')}workbench-harper.webp"
						width="1044"
						height="570"
						aria-label="A lyric line reading 'I has counted every streetlight' with a wavy underline under the disagreement, previewing 'has' struck through and 'have' beside it. Hovering the underline opens a popover explaining that the verb must agree in number with the pronoun, citing Harper and advising that the suggestion be reviewed in context; pressing Replace with have corrects the line and the underline goes."
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
					<a href={harperUrl} rel="external">Harper</a>, the open-source English grammar engine,
					runs inside the page — so your lyrics are not sent to Harper or to a LyricLint server.
				</p>
				<p class="lp-prose">
					Lyrics are not ordinary prose, so it stays advisory: its fixes are always shown for
					review. Performer names and reviewed Genius spellings such as
					<code class="site-code">ayy</code> are added to its dictionary, and LyricLint's sourced Genius
					rules take precedence wherever the two disagree.
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
							><strong>No account and no upload.</strong> There is no server to send one to.</span
						>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<Check size={12} strokeWidth={3.3} />
						</span>
						<span>
							<strong>Autosaved in your own browser.</strong> Closing the tab does not lose work, and
							a crash does not either.
						</span>
					</li>
					<li>
						<span class="lp-points__mark" aria-hidden="true">
							<Check size={12} strokeWidth={3.3} />
						</span>
						<span>
							<strong>Works offline once loaded</strong>, which matters when the rules you are
							checking against live on a site that is not always reachable.
						</span>
					</li>
				</ul>
			</div>

			<div class="lp-split__copy">
				<h2>Your lyrics stay in your browser.</h2>
				<p class="lp-prose">
					The exceptions are yours to choose, each on its own press. You can play the song you are
					transcribing alongside the lyrics: an audio file off your own disk, which is never
					uploaded and never copied into the browser, a YouTube video, which loads Google's player
					into the page and lets Google see which video it is, or an Apple Music track — a 'scribe
					using the online options stops working offline. And you can ask the rules assistant a
					question about the guidelines, which sends that question — never your 'scribe — to be
					answered. <a href={resolve('/privacy/')}>The privacy page</a> lists everything.
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
				<div class="lp-panel__head">Guidelines</div>
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
				<h2>Every guideline we could find, in one place.</h2>
				<p class="lp-prose">
					Genius's transcription guidance is scattered across staff guides, accepted annotations,
					and forum rulings. The Guidelines gather it: {guidanceCount} reviewed conventions across
					{guidanceTopicCount} topics — section headers, spelling, ad-libs, censored and unknown words,
					non-English songs, and more — each stated plainly with the source behind it, including the conventions
					no linter could check.
				</p>
				<p class="lp-prose">
					Every entry says how much standing it has: staff guidance ranks above editor-reviewed
					annotations, and those above outside references and community writing. Where a convention
					is LyricLint's own preference rather than anything Genius states, it is marked as exactly
					that — and where the linter checks a convention, the entry names the rules that check it,
					and each rule's page links back.
				</p>
				<p class="lp-prose">
					<a href={resolve('/guidelines/')}>Go to the Guidelines</a> — they read on their own, before
					the workbench is ever open.
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
					<p class="lp-run__body">You copy the finished markup out and paste it in.</p>
				</li>
				<li>
					<span class="lp-run__title">Not an automated transcriber</span>
					<p class="lp-run__body">
						Linting is deterministic, reviewed rules — no model rewrites your words. The one AI
						surface is the optional rules assistant, which answers questions about the guidelines
						and can never see your 'scribe.
					</p>
				</li>
				<li>
					<span class="lp-run__title">Not a live scraper</span>
					<p class="lp-run__body">
						The rules are a reviewed, versioned snapshot, so what it checks today is what it checked
						yesterday.
					</p>
				</li>
				<li>
					<span class="lp-run__title">Not a rewriter</span>
					<p class="lp-run__body">
						Nothing changes in your document unless you press the control that changes it.
					</p>
				</li>
			</ul>
		</div>
	</section>

	<!-- The invitation comes after the argument and before the closing ask, as a
	     section of its own rather than a third button in the CTA pair: the CTA
	     answers "what do I do now" about the product, and this answers a
	     different question for a different reader. The button is the bordered
	     tier, not contrast — the page's one contrast action is opening the
	     workbench — and it wears the same GitHub mark the hero's "Open source"
	     fact already established. -->
	<section class="lp-section">
		<div class="lp-container">
			<div class="lp-head">
				<h2>Built in the open, and better with help.</h2>
				<p>
					Everything on this page — the workbench, the rules, the scripts that film it — is in one
					public repository. If LyricLint misses something, gets a lyric wrong, or lacks a check you
					wish it ran, an issue is the fastest way to make it better; pull requests are welcome too,
					from a one-line fix to a whole feature.
				</p>
			</div>
			<a class="button" href="https://github.com/hkarlsen06/LyricLint" rel="external">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
					/>
				</svg>
				<span>Contribute on GitHub</span>
			</a>
		</div>
	</section>

	<section class="lp-cta">
		<div class="lp-container">
			<h2>Submit it right the first time.</h2>
			<p>
				Free, no account, and your lyrics stay in your browser. Paste a transcription and see what
				it finds.
			</p>
			<div class="lp-cta__actions">
				<a class="button button--contrast" href={resolve('/lint/')}>
					<LyricIcon />
					<span>Open the workbench</span>
				</a>
				<a class="button" href={resolve('/guidelines/')}>Go to the Guidelines</a>
			</div>
		</div>
	</section>
</main>
