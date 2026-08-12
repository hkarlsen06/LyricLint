<script lang="ts">
	/**
	 * The assistant's entry point on the reference sections: the sparkles toggle
	 * at the end of the search field, owning the whole finder row so the two
	 * index columns cannot grow separate copies of what a press does.
	 *
	 * At rest the wand is struck through — the filter chips' unpressed idiom on
	 * a control with no word to strike: the assistant is off, and the row is the
	 * section's own search field. Pressing the wand sweeps it to the head of the
	 * row, takes the strike off, and turns the field into the ask field; Enter
	 * there opens the shared modal with the question already sent
	 * (`openWithQuestion`, which starts its own chat, because this field is not
	 * in a conversation). Pressing the wand again — or Escape in an empty ask
	 * field, the same way out the search field owes — returns the search, with
	 * whatever query it was holding: the mode swap must not eat a search the
	 * reader means to come back to, and the readout below still discloses a
	 * query that is narrowing the list while the field is showing the prompt.
	 *
	 * The sweep is a wipe, and the wand is its edge: the outgoing bar stays
	 * whole ahead of the wand and is masked in its wake, where the incoming bar
	 * is unveiled — three animations sharing one duration and one easing, so
	 * the mask's edge, the unveil's edge and the wand cannot drift apart. That
	 * is why both bars are mounted in one stacked slot rather than swapped: a
	 * wipe needs something on both sides of its edge. Only the active layer
	 * draws at rest (`visibility`, never opacity — and never `display`, which
	 * would take the hidden bar's box away from the clip the wipe animates);
	 * the outgoing layer is held visible for exactly the animation's length by
	 * its own keyframes, pinned to its old position against the slot having
	 * shifted by the wand's width. Everything is measured across the toggle
	 * rather than declared, runs only under `prefers-reduced-motion:
	 * no-preference`, and is timed by the motion tokens read off the control
	 * itself — a literal duration here would be a second timing scale waiting
	 * to drift. The DOM order follows the visual order in both states, so the
	 * press recreates the button and focus is handed to the active field
	 * explicitly, which is where the press was headed anyway.
	 *
	 * `aria-pressed` carries the state and the accessible name never changes,
	 * exactly as the editor's search magnifier reports its bar; the accent while
	 * pressed is the same report, and the slash is the non-color cue beside it.
	 * The button draws only in builds with an assistant endpoint behind it —
	 * the row is just the search field otherwise.
	 */
	import { WandSparkles } from 'lucide-svelte';
	import { tick, type Snippet } from 'svelte';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { useAssistantState, type AssistantState } from '$lib/assistant/assistant.svelte.js';

	let {
		prompt,
		search,
		assistant: assistantProp
	}: {
		/** The ask field's whole label: accessible name and placeholder alike. */
		prompt: string;
		/** The section's own search field, drawn while the assistant is off. */
		search: Snippet;
		/** Test seam; the host-provided context state otherwise. */
		assistant?: AssistantState | undefined;
	} = $props();

	const contextAssistant = useAssistantState();
	const assistant = $derived(assistantProp ?? contextAssistant);

	let asking = $state(false);
	let question = $state('');
	let row = $state<HTMLElement>();

	async function toggle(): Promise<void> {
		const wandBefore = row?.querySelector('button')?.getBoundingClientRect();
		const slotBefore = row?.querySelector('.site-finder__slot')?.getBoundingClientRect();
		asking = !asking;
		await tick();
		const wand = row?.querySelector('button');
		const slot = row?.querySelector('.site-finder__slot');
		if (
			wandBefore &&
			slotBefore &&
			wand &&
			slot &&
			window.matchMedia('(prefers-reduced-motion: no-preference)').matches
		) {
			// Positive delta is the wand travelling to the head of the row; the
			// same number is the width the wipe has to cover, because the wand's
			// journey and the bar it crosses are the same span.
			const delta = wandBefore.left - wand.getBoundingClientRect().left;
			if (delta !== 0) {
				const styles = getComputedStyle(wand);
				const timing = {
					duration: Number.parseFloat(styles.getPropertyValue('--duration-slow')) || 0,
					easing: styles.getPropertyValue('--ease-out-quart').trim() || 'ease'
				};
				wand.animate([{ translate: `${delta}px 0` }, { translate: '0 0' }], timing);

				// The incoming bar is unveiled in the wand's wake: clipped to
				// nothing on the side the wand starts from, opened as it travels.
				row
					?.querySelector('.site-finder__layer[data-active="true"]')
					?.animate(
						delta > 0
							? [{ clipPath: `inset(0 0 0 ${delta}px)` }, { clipPath: 'inset(0 0 0 0)' }]
							: [{ clipPath: `inset(0 ${-delta}px 0 0)` }, { clipPath: 'inset(0 0 0 0)' }],
						timing
					);

				// The outgoing bar stays whole ahead of the wand and is masked
				// behind it. Its keyframes hold it visible for the animation's
				// length (the resting rule hides it) and pin it to the position
				// the slot just left, so the mask's edge is read against a bar
				// that has not moved.
				const shift = slotBefore.left - slot.getBoundingClientRect().left;
				const hold = { visibility: 'visible', translate: `${shift}px 0` };
				row?.querySelector('.site-finder__layer[data-active="false"]')?.animate(
					delta > 0
						? [
								{ ...hold, clipPath: 'inset(0 0 0 0)' },
								{ ...hold, clipPath: `inset(0 ${delta}px 0 0)` }
							]
						: [
								{ ...hold, clipPath: 'inset(0 0 0 0)' },
								{ ...hold, clipPath: `inset(0 0 0 ${-delta}px)` }
							],
					timing
				);
			}
		}
		row?.querySelector<HTMLElement>('.site-finder__layer[data-active="true"] input')?.focus();
	}

	async function submit(): Promise<void> {
		if (!assistant) return;
		const asked = question.trim();
		if (asked === '') return;
		question = '';
		await assistant.openWithQuestion(asked);
	}

	// Escape empties the field first, which is the convention the search field
	// beside this one already keeps; empty, it is the keyboard's way back to
	// the search, since the wand is behind the field from where the caret sits.
	function onAskKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			void submit();
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		if (question !== '') {
			question = '';
			return;
		}
		void toggle();
	}
</script>

{#snippet wand()}
	<button
		type="button"
		class="button button--quiet site-finder__assistant"
		aria-label="Ask the assistant"
		title="Ask the assistant"
		aria-pressed={asking}
		onclick={() => void toggle()}
	>
		<span class="site-finder__assistant-glyph" aria-hidden="true">
			<WandSparkles size={18} strokeWidth={2} />
		</span>
	</button>
{/snippet}

{#if assistant && assistantAvailable()}
	<div class="site-finder__row" bind:this={row}>
		{#if asking}
			{@render wand()}
		{/if}
		<div class="site-finder__slot">
			<div class="site-finder__layer" data-active={!asking}>
				{@render search()}
			</div>
			<div class="site-finder__layer" data-active={asking}>
				<input
					class="site-finder__search"
					type="text"
					autocomplete="off"
					spellcheck="false"
					enterkeyhint="send"
					aria-label={prompt}
					placeholder={prompt}
					bind:value={question}
					onkeydown={onAskKeydown}
				/>
			</div>
		</div>
		{#if !asking}
			{@render wand()}
		{/if}
	</div>
{:else}
	<div class="site-finder__row">{@render search()}</div>
{/if}
