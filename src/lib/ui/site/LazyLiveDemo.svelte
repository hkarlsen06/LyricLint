<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	let {
		text,
		language = 'en',
		performerNames = []
	}: {
		text: string;
		language?: string;
		performerNames?: readonly string[];
	} = $props();

	type LiveDemoComponent = typeof import('./LiveDemo.svelte').default;
	let Demo = $state<LiveDemoComponent>();

	/*
	 * Keep the landing route's first screen independent of the editor graph.
	 *
	 * LiveDemo is the real CodeMirror editor and eventually starts Harper's
	 * 18MB grammar WASM. It sits below the hero, so doing that work during the
	 * first navigation spends bandwidth and main-thread time on a surface the
	 * reader cannot see. The prerendered stand-in is already the component's
	 * no-JavaScript state; keep it until this section is close enough that a
	 * normal scroll will reach it next.
	 *
	 * The 300px margin is intentionally a look-ahead rather than a delay. It
	 * gives the dynamic module time to arrive before the section is exposed,
	 * while a page left at the hero never downloads the editor or Harper.
	 */
	const loadNearViewport: Attachment<HTMLDivElement> = (element) => {
		let cancelled = false;
		let observer: IntersectionObserver | undefined;

		const load = () => {
			observer?.disconnect();
			void import('./LiveDemo.svelte').then(({ default: component }) => {
				if (!cancelled) Demo = component;
			});
		};

		if (!('IntersectionObserver' in window)) {
			load();
			return () => (cancelled = true);
		}

		observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) load();
			},
			{ rootMargin: '300px 0px' }
		);
		observer.observe(element);

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	};

	const performerList = $derived(
		new Intl.ListFormat('en', { style: 'long', type: 'disjunction' }).format(performerNames)
	);
</script>

<div class="site-demo-loader" {@attach loadNearViewport}>
	{#if Demo}
		<Demo {text} {language} {performerNames} />
	{:else}
		<!-- This is deliberately the same shape and copy as LiveDemo's initial
		     frame. Swapping in CodeMirror therefore changes capability without
		     moving the section around. It is also the complete prerendered and
		     no-JavaScript version crawlers and non-scripted readers receive. -->
		<div class="site-demo">
			<div class="site-demo__editor">
				<pre class="site-demo__fallback">{text}</pre>
			</div>
			<p class="site-demo__hint">
				Hover over an underline to see the finding, the relevant Genius guideline, and the suggested
				fix.
				{#if performerNames.length > 0}
					Select a line to credit it to {performerList}.
				{/if}
				Edit directly to see what else the editor catches.
			</p>
		</div>
	{/if}
</div>
