import { fireEvent, screen } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { AssistantReferenceRecord } from '$lib/assistant/types.js';
import AssistantReferenceCard from './AssistantReferenceCard.svelte';

function shown(): AssistantReferenceRecord {
	return {
		id: 'ref-1',
		anchor: { exact: 'Whenever you call', before: 'And I said ', after: '\nI will be' },
		note: 'The second verse opens here.',
		occurrence: { index: 1, total: 2 },
		status: 'shown'
	};
}

function failed(
	reason?: Extract<AssistantReferenceRecord, { status: 'failed' }>['reason']
): AssistantReferenceRecord {
	const record: AssistantReferenceRecord = {
		id: 'ref-1',
		anchor: { exact: 'Whenever you call', before: '', after: '' },
		note: 'The second verse opens here.',
		status: 'failed'
	};
	if (reason) record.reason = reason;
	return record;
}

function assistantStub(): AssistantState {
	const stub: Partial<AssistantState> = {
		revealReference: vi.fn(() => true)
	};
	return stub as AssistantState;
}

afterEach(cleanup);

describe('an assistant lyric-reference card', () => {
	test('quotes the exact text between its context with no injected whitespace', () => {
		const { container } = render(AssistantReferenceCard, {
			reference: shown(),
			assistant: assistantStub()
		});
		const quote = container.querySelector('.assistant-reference__quote');
		// The context strings end exactly where the exact text begins; markup
		// whitespace between the spans would draw a space that is not in the
		// lyric, and it is a formatter that breaks this.
		expect(quote?.textContent).toBe(
			"Show in the 'scribe: And I said Whenever you call ⏎ I will be"
		);
		expect(container.textContent).toContain('The second verse opens here.');
		expect(container.querySelector('.assistant-proposal__diff')).toBeNull();
	});

	test('hovering the card and pressing or focusing the quote all reveal the place', async () => {
		const assistant = assistantStub();
		const { container } = render(AssistantReferenceCard, {
			reference: shown(),
			assistant
		});

		await fireEvent.pointerEnter(container.querySelector('.assistant-reference')!);
		expect(assistant.revealReference).toHaveBeenCalledTimes(1);
		// The pin travels with the anchor: a reference outlives the proposals in
		// its own turn, which move the lines under it as they are applied.
		expect(assistant.revealReference).toHaveBeenCalledWith(shown().anchor, shown().occurrence);

		const quote = screen.getByRole('button', { name: /Show in the 'scribe/ });
		await fireEvent.click(quote);
		await fireEvent.focus(quote);
		expect(assistant.revealReference).toHaveBeenCalledTimes(3);
	});

	test('a failed reference is inert prose that says why, not a control', async () => {
		const assistant = assistantStub();
		const view = render(AssistantReferenceCard, { reference: failed('ambiguous'), assistant });
		expect(view.container.textContent).toContain('Not shown.');
		expect(view.container.textContent).toContain('appears more than once');
		expect(view.container.querySelector('button')).toBeNull();

		await fireEvent.pointerEnter(view.container.querySelector('.assistant-reference')!);
		expect(assistant.revealReference).not.toHaveBeenCalled();

		await view.rerender({ reference: failed(), assistant });
		expect(view.container.textContent).toContain('could not be found');
	});
});
