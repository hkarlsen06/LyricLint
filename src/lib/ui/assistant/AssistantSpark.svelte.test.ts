import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import type { AskOptions } from '$lib/assistant/api.js';
import { cannedAnswer, memoryRepository } from '$lib/assistant/assistant-test-utils.js';
import { createAssistantState } from '$lib/assistant/assistant.svelte.js';
import AssistantSpark from './AssistantSpark.svelte';

// The section's own search field, as the indexes supply it: the spark owns the
// row and renders this untouched while the assistant is off.
const search = createRawSnippet(() => ({
	render: () =>
		'<input class="site-finder__search" type="search" aria-label="Search the formatting rules" />'
}));

function makeAssistant() {
	const repository = memoryRepository();
	// The mock is typed on `vi.fn` itself so `ask.mock.calls` carries the wire
	// messages the send assertion reads; the canned answer ignores its options.
	const ask = vi.fn<(options: AskOptions) => Promise<ReturnType<typeof cannedAnswer>>>(async () =>
		cannedAnswer({
			scope: 'mixed',
			blocks: [
				{
					kind: 'prose',
					text: 'A chorus repeated verbatim keeps one header per copy.',
					ruleIds: [],
					sourceIds: []
				}
			]
		})
	);
	return {
		ask,
		assistant: createAssistantState({
			repository: async () => repository,
			ask,
			ruleSetVersion: 'test'
		})
	};
}

function wand(): HTMLButtonElement {
	return document.querySelector<HTMLButtonElement>('.site-finder__assistant')!;
}

function slashDrawn(): boolean {
	const glyph = document.querySelector<HTMLElement>('.site-finder__assistant-glyph')!;
	return getComputedStyle(glyph, '::after').content !== 'none';
}

// Both bars stay mounted so the toggle's wipe has something on both sides of
// its edge; which one the reader has is a visibility question, never presence.
function searchField(): HTMLInputElement {
	return document.querySelector<HTMLInputElement>('input[type="search"]')!;
}

function askField(): HTMLInputElement {
	return document.querySelector<HTMLInputElement>(
		'input[aria-label="Ask about the formatting rules"]'
	)!;
}

function visible(el: HTMLElement): boolean {
	return getComputedStyle(el).visibility !== 'hidden';
}

describe('the assistant spark', () => {
	it('is struck through at rest beside the untouched search field', () => {
		const { assistant } = makeAssistant();
		render(AssistantSpark, { prompt: 'Ask about the formatting rules', search, assistant });

		expect(visible(searchField())).toBe(true);
		expect(visible(askField())).toBe(false);
		expect(wand().getAttribute('aria-pressed')).toBe('false');
		// The strike is the non-color cue for the unpressed state — the filter
		// chips' idiom on a control with no word to strike.
		expect(slashDrawn()).toBe(true);

		// The slash carries the state, so it keeps the button's full text color
		// while the wand steps down to the muted tone underneath it — one mark at
		// two weights, not two marks at full weight fighting for the same pixels.
		const glyph = document.querySelector<HTMLElement>('.site-finder__assistant-glyph')!;
		const slashColor = getComputedStyle(glyph, '::after').backgroundColor;
		expect(slashColor).toBe(getComputedStyle(wand()).color);
		expect(getComputedStyle(glyph.querySelector('svg')!).color).not.toBe(slashColor);
	});

	it('sweeps to the head of the row and unveils the ask field, then back', async () => {
		const { assistant } = makeAssistant();
		render(AssistantSpark, { prompt: 'Ask about the formatting rules', search, assistant });

		wand().click();
		await vi.waitFor(() => {
			expect(visible(askField())).toBe(true);
		});

		// Mid-sweep the outgoing bar is still on screen — its keyframes hold it
		// visible so the wand has something to mask — and once the wipe settles
		// it is hidden: visibility, never removed, because the wipe needs both
		// bars mounted. The strike is off, and the wand leads the row: DOM order
		// matches the visual order, which is why focus is handed to the field
		// explicitly rather than left on a recreated button.
		expect(visible(searchField())).toBe(true);
		await vi.waitFor(() => {
			expect(visible(searchField())).toBe(false);
		});
		expect(wand().getAttribute('aria-pressed')).toBe('true');
		expect(slashDrawn()).toBe(false);
		expect(
			wand().compareDocumentPosition(askField()) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(document.activeElement).toBe(askField());

		wand().click();
		await vi.waitFor(() => {
			expect(visible(searchField())).toBe(true);
		});
		expect(wand().getAttribute('aria-pressed')).toBe('false');
		expect(slashDrawn()).toBe(true);
		// After the return wipe settles, the ask bar goes back to hidden.
		await vi.waitFor(() => {
			expect(visible(askField())).toBe(false);
		});
	});

	it('sends the question on Enter, opens the modal state, and clears the field', async () => {
		const { assistant, ask } = makeAssistant();
		render(AssistantSpark, { prompt: 'Ask about the formatting rules', search, assistant });

		wand().click();
		await vi.waitFor(() => {
			expect(visible(askField())).toBe(true);
		});
		askField().value = 'When does a chorus need its own header?';
		askField().dispatchEvent(new Event('input', { bubbles: true }));
		askField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		await vi.waitFor(() => {
			expect(ask).toHaveBeenCalledOnce();
		});
		expect(assistant.isOpen).toBe(true);
		expect(JSON.stringify(ask.mock.calls[0]![0].messages)).toContain(
			'When does a chorus need its own header?'
		);
		expect(askField().value).toBe('');
	});

	it('empties on Escape first, and returns the search from an empty field', async () => {
		const { assistant } = makeAssistant();
		render(AssistantSpark, { prompt: 'Ask about the formatting rules', search, assistant });

		wand().click();
		await vi.waitFor(() => {
			expect(visible(askField())).toBe(true);
		});
		askField().value = 'half a question';
		askField().dispatchEvent(new Event('input', { bubbles: true }));
		askField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await vi.waitFor(() => {
			expect(askField().value).toBe('');
		});
		// Still asking: the first Escape only cleared the text.
		expect(wand().getAttribute('aria-pressed')).toBe('true');

		askField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await vi.waitFor(() => {
			expect(visible(searchField())).toBe(true);
		});
		expect(wand().getAttribute('aria-pressed')).toBe('false');
		await vi.waitFor(() => {
			expect(visible(askField())).toBe(false);
		});
	});

	it('draws the bare search field where no assistant is provided', () => {
		render(AssistantSpark, { prompt: 'Ask about the formatting rules', search });

		expect(document.querySelector('input[type="search"]')).not.toBeNull();
		expect(document.querySelector('.site-finder__assistant')).toBeNull();
	});
});
