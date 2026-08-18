import { fireEvent, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { AssistantToolCallRecord } from '$lib/persistence/types.js';
import AssistantToolTurn from './AssistantToolTurn.svelte';

type DraftReadCall = Extract<AssistantToolCallRecord, { name: 'read_scribe' }>;

function assistantStub() {
	return {
		allowDraftRead: vi.fn(async () => undefined),
		denyDraftRead: vi.fn(async () => undefined)
	} as unknown as AssistantState;
}

afterEach(cleanup);

describe('an assistant draft-read turn', () => {
	test('Allow calls the store and the resolved turn collapses to one line', async () => {
		const assistant = assistantStub();
		const call: DraftReadCall = { callId: 'read-1', name: 'read_scribe' };
		const view = render(AssistantToolTurn, { call, assistant, decidable: true });

		expect(view.container.querySelector('[aria-live="polite"]')?.textContent).toContain('Waiting');
		// The question is addressed to the reader, so it is set as prose.
		const prose = getComputedStyle(view.container.querySelector('.assistant-tool-turn p')!);
		const askedIn = { size: prose.fontSize, family: prose.fontFamily, color: prose.color };

		await fireEvent.click(within(view.container).getByRole('button', { name: 'Allow' }));
		expect(assistant.allowDraftRead).toHaveBeenCalledOnce();

		await view.rerender({ call: { ...call, outcome: 'granted' }, assistant, decidable: true });
		expect(view.container.textContent?.trim()).toBe("'Scribe shared.");
		expect(within(view.container).queryByRole('button', { name: 'Allow' })).toBeNull();
		expect(within(view.container).queryByRole('button', { name: 'Deny' })).toBeNull();

		// The answer is a record of what the workbench did, not something the
		// assistant said: the meta idiom — a glyph, muted, smaller, mono — rather
		// than the type the prose above it is set in.
		const receipt = view.container.querySelector<HTMLElement>('.assistant-tool-turn__receipt')!;
		const record = getComputedStyle(receipt);
		expect(parseFloat(record.fontSize)).toBeLessThan(parseFloat(askedIn.size));
		expect(record.fontFamily).not.toBe(askedIn.family);
		expect(record.color).not.toBe(askedIn.color);
		expect(receipt.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});

	test("Deny calls the store and states that the 'scribe was not shared", async () => {
		const assistant = assistantStub();
		const call: DraftReadCall = { callId: 'read-1', name: 'read_scribe' };
		const view = render(AssistantToolTurn, { call, assistant, decidable: true });

		await fireEvent.click(within(view.container).getByRole('button', { name: 'Deny' }));
		expect(assistant.denyDraftRead).toHaveBeenCalledOnce();
		await view.rerender({ call: { ...call, outcome: 'denied' }, assistant, decidable: true });
		expect(view.container.textContent?.trim()).toBe("'Scribe not shared.");
	});

	test('an undecided call with no live session is stated as history, not asked again', () => {
		// The record outlives the session, so a restored transcript redraws this
		// call — and `allowDraftRead` refuses without a session. Drawn as a
		// prompt it is two dead buttons under a line saying the turn is over.
		const assistant = assistantStub();
		const call: DraftReadCall = { callId: 'read-1', name: 'read_scribe' };
		const view = render(AssistantToolTurn, { call, assistant, decidable: false });

		expect(within(view.container).queryByRole('button', { name: 'Allow' })).toBeNull();
		expect(within(view.container).queryByRole('button', { name: 'Deny' })).toBeNull();
		expect(view.container.textContent?.trim()).toBe("The assistant asked to read this 'scribe.");
		// The same meta idiom the settled outcomes take, and no live region: a
		// record of what happened is not something to announce as waiting.
		expect(view.container.querySelector('.assistant-tool-turn__receipt')).not.toBeNull();
		expect(view.container.querySelector('[aria-live="polite"]')).toBeNull();
	});
});
