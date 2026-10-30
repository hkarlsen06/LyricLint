<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { GuideTerm } from '#lib/guidance/glossary.js';
	import { dismissOnOutside } from '#lib/interaction/dismiss.js';

	let { text, term, mark }: { text: string; term: GuideTerm; mark?: Snippet<[string]> } = $props();
	const id = $props.id();
	let ready = $state(false);
	let open = $state(false);
	let trigger: HTMLButtonElement;
	let panel: HTMLSpanElement | undefined = $state();
	onMount(() => {
		ready = true;
	});

	function close(restoreFocus = false) {
		open = false;
		if (restoreFocus) trigger.focus({ preventScroll: true });
	}

	function escape(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close(true);
		}
	}

	$effect(() => {
		if (!open || !panel) return;
		const surface = panel;
		function position() {
			const anchor = trigger.getBoundingClientRect();
			const edge = parseFloat(getComputedStyle(surface).paddingLeft);
			const viewport = window.visualViewport;
			const left = viewport?.offsetLeft ?? 0;
			const top = viewport?.offsetTop ?? 0;
			const width = viewport?.width ?? document.documentElement.clientWidth;
			const height = viewport?.height ?? window.innerHeight;
			surface.style.maxWidth = `${Math.max(0, width - edge * 2)}px`;
			surface.style.maxHeight = `${Math.max(0, height - edge * 2)}px`;
			const bounds = surface.getBoundingClientRect();
			const right = left + width;
			const bottom = top + height;
			const below = anchor.bottom + edge;
			surface.style.left = `${Math.max(left + edge, Math.min(anchor.left, right - bounds.width - edge))}px`;
			surface.style.top = `${Math.max(top + edge, Math.min(below + bounds.height <= bottom - edge ? below : anchor.top - bounds.height - edge, bottom - bounds.height - edge))}px`;
		}
		position();
		surface.focus({ preventScroll: true });
		const observer = new ResizeObserver(position);
		observer.observe(surface);
		window.addEventListener('resize', position);
		window.addEventListener('scroll', position, true);
		window.visualViewport?.addEventListener('resize', position);
		window.visualViewport?.addEventListener('scroll', position);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', position);
			window.removeEventListener('scroll', position, true);
			window.visualViewport?.removeEventListener('resize', position);
			window.visualViewport?.removeEventListener('scroll', position);
		};
	});
</script>

<span
	class="glossary-term"
	onfocusout={(event) => {
		if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
			close();
	}}
	{@attach open ? dismissOnOutside(() => close()) : undefined}
	><button
		type="button"
		class="glossary-term__trigger"
		bind:this={trigger}
		disabled={!ready}
		aria-label={`${text}: show definition`}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={open ? `${id}-definition` : undefined}
		onkeydown={escape}
		onclick={() => (open = !open)}
		>{#if mark}{@render mark(text)}{:else}{text}{/if}</button
	>{#if open}<span
			bind:this={panel}
			id={`${id}-definition`}
			class="glossary-term__definition"
			role="dialog"
			tabindex="-1"
			aria-labelledby={`${id}-name`}
			aria-describedby={`${id}-meaning`}
			onkeydown={escape}
			><strong id={`${id}-name`}>{term.name}</strong><span id={`${id}-meaning`}
				>{term.definition}</span
			><button type="button" class="button button--quiet" onclick={() => close(true)}
				>Close definition</button
			></span
		>{/if}</span
>

<style>
	.glossary-term__trigger {
		display: inline;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-xs);
		background: none;
		color: inherit;
		font: inherit;
		text-align: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 0.2em;
		text-decoration-thickness: 1px;
		cursor: pointer;
	}
	.glossary-term__trigger:hover,
	.glossary-term__trigger[aria-expanded='true'] {
		background: var(--color-fill-subtle);
		text-decoration-style: solid;
	}
	.glossary-term__trigger:disabled {
		color: inherit;
		background: none;
		text-decoration: none;
		cursor: auto;
	}
	.glossary-term__definition {
		position: fixed;
		z-index: var(--layer-popover);
		display: grid;
		gap: var(--space-3);
		box-sizing: border-box;
		width: min(22rem, calc(100vw - var(--space-8)));
		max-height: calc(100dvh - var(--space-8));
		overflow: auto;
		padding: var(--space-4);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-overlay);
		box-shadow: var(--shadow-popover);
		color: var(--color-text);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-body);
		text-align: start;
		white-space: normal;
	}
	.glossary-term__definition .button {
		justify-self: end;
	}
</style>
