import { cleanup, fireEvent, render } from '@testing-library/svelte';
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
		const view = render(AssistantToolTurn, { call, assistant });

		expect(view.container.querySelector('[aria-live="polite"]')?.textContent).toContain('Waiting');
		await fireEvent.click(view.getByRole('button', { name: 'Allow' }));
		expect(assistant.allowDraftRead).toHaveBeenCalledOnce();

		await view.rerender({ call: { ...call, outcome: 'granted' }, assistant });
		expect(view.container.textContent?.trim()).toBe('Draft shared.');
		expect(view.queryByRole('button', { name: 'Allow' })).toBeNull();
		expect(view.queryByRole('button', { name: 'Deny' })).toBeNull();
	});

	test('Deny calls the store and states that the draft was not shared', async () => {
		const assistant = assistantStub();
		const call: DraftReadCall = { callId: 'read-1', name: 'read_scribe' };
		const view = render(AssistantToolTurn, { call, assistant });

		await fireEvent.click(view.getByRole('button', { name: 'Deny' }));
		expect(assistant.denyDraftRead).toHaveBeenCalledOnce();
		await view.rerender({ call: { ...call, outcome: 'denied' }, assistant });
		expect(view.container.textContent?.trim()).toBe('Draft not shared.');
	});
});
