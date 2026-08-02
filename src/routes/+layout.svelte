<script lang="ts">
	import { dev } from '$app/environment';
	import { base } from '$app/paths';
	import {
		createDefaultAssistantState,
		provideAssistantState
	} from '$lib/assistant/assistant.svelte.js';
	import { provideFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import '$lib/ui/styles/global.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	// Provided at the root rather than inside `(app)` so the error page — which
	// sits above both groups — still resolves the context if it ever announces.
	provideFeedbackState();
	// The assistant is provided here for the opposite reason as well: both the
	// rule reference under `(site)` and the workbench under `(app)` open the
	// same conversation, and a request stays live while the modal is closed
	// because this state outlives every page under it.
	const assistant = provideAssistantState(createDefaultAssistantState());

	/*
	 * The modal draws nothing until assistant.open() is called, so its dialog,
	 * conversation, markdown, and Bits UI graph do not belong in every route's
	 * first navigation. The state remains rooted here — a live answer still
	 * survives navigation between the rules and the workbench — while the view
	 * joins it only when that state says there is something to show.
	 */
	type AssistantHostComponent = typeof import('$lib/ui/assistant/AssistantHost.svelte').default;
	let AssistantHost = $state<AssistantHostComponent>();
	let assistantHostLoading = false;

	$effect(() => {
		if (!assistant.isOpen || AssistantHost || assistantHostLoading) return;
		assistantHostLoading = true;
		void import('$lib/ui/assistant/AssistantHost.svelte').then(({ default: component }) => {
			AssistantHost = component;
		});
	});

	// The offline worker is a production promise, and registering it against a dev
	// server breaks the dev server. It is cache-first over every same-origin GET,
	// which in dev is every Vite module request, and its miss path throws rather
	// than failing the way a network error fails — so an ordinary restart or dep
	// re-optimize becomes a rejected dynamic import, which the browser caches
	// against that module's URL for the life of the document. The tab lands on
	// `+error.svelte` and cannot leave it. It also answers `static/` from the
	// cache first, so an edited asset stays the old one.
	//
	// `kit.serviceWorker.register` is off for that reason, so this is the only
	// registration; `type: 'classic'` matches what SvelteKit builds for the
	// non-dev branch it replaces.
	//
	// Unregistering under `dev` is not tidiness: a worker installed by an earlier
	// build of this app goes on controlling `localhost` until something takes it
	// off, so leaving the branch out would fix new checkouts and no existing one.
	onMount(() => {
		if (!('serviceWorker' in navigator)) return;

		if (!dev) {
			void navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'classic' });
			return;
		}

		void (async () => {
			for (const registration of await navigator.serviceWorker.getRegistrations()) {
				await registration.unregister();
			}
			// Its own precache only. Anything else on this origin belongs to whatever
			// else the developer runs here.
			for (const name of await caches.keys()) {
				if (name.startsWith('lyriclint-')) await caches.delete(name);
			}
		})();
	});
</script>

<svelte:head>
	<!-- The bracketed-waveform mark. The SVG is what modern browsers pick up; the
	     PNGs cover tab strips, pinned tiles, and iOS home screens that never ask
	     for the vector. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
	<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<!-- Installability, and the only way to be rid of the browser's own chrome. In
	     a Safari tab the domain pill sits over the transport strip while the
	     keyboard is up, and nothing a page can do removes it; added to the home
	     screen with `display: standalone`, there is no URL bar and no pill.

	     `start_url` is the workbench rather than `/`, because the icon on someone's
	     home screen is there to open the thing they transcribe with, and `scope` is
	     the whole origin so the rule reference stays inside the app rather than
	     kicking back out to a browser tab.

	     `apple-mobile-web-app-capable` is the same request in the form iOS before
	     17.4 understands; from 17.4 the manifest's `display` is what answers. It is
	     deprecated in favour of `mobile-web-app-capable`, which is what every other
	     browser reads out of the manifest anyway — so the Apple spelling is the one
	     that still buys anything.

	     No `theme_color` in the manifest on purpose: it takes a single value, and
	     the two tags below already answer per scheme, which is what the status bar
	     reads. `background_color` cannot be scheme-aware and is the launch splash
	     only, so it takes the dark canvas. -->
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<!-- The layout owns what is true of every route: icons and the browser-chrome
	     tint. Titles and descriptions belong to the leaf routes.

	     There is deliberately no default <meta name="description"> here. SvelteKit
	     concatenates heads rather than deduping them, and where two of the same tag
	     end up in one document the first one wins — a layout-level default would
	     therefore be emitted *above* each rule page's own description and shadow
	     all forty-seven of them, which is the opposite of what a default is for.
	     The same reasoning is why there is no layout <title>: it would silently
	     defeat the error page's. -->

	<!-- Browser-chrome tint, tracking --color-canvas (the recessed page surface the
	     chrome sits against). Hex rather than oklch() on purpose: theme-color is
	     honored by Safari/iOS 15.0–15.3 and Chromium before 111, none of which can
	     parse oklch() and would silently drop the tint. `theme-color.test.ts`
	     converts both canvas tokens and asserts these two hexes, so the pair below
	     is the value of record; this comment is not. Keep in sync with tokens.css:
	       light #dfdfe3 = oklch(90.5% 0.006 285)
	       dark  #0b0b0d = oklch(15% 0.004 285) -->
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#dfdfe3" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0d" />
</svelte:head>

<!-- Nothing but the head, the stylesheet, and the assistant modal live here.
     The workbench's shell wrapper, its feedback regions, and the phone gate
     belong to `(app)`: the gate removes the app on a phone, and the pages
     under `(site)` are the ones a phone is meant to be able to read. -->
{@render children()}
{#if AssistantHost}
	<AssistantHost {assistant} />
{/if}
