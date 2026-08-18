import { fireEvent, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { AssistantLinkActionRecord } from '$lib/assistant/types.js';
import AssistantLinkActionCard from './AssistantLinkActionCard.svelte';

function action(
	status: AssistantLinkActionRecord['status'] = 'pending',
	reason?: Extract<AssistantLinkActionRecord, { status: 'failed' }>['reason'],
	kind: 'link' | 'unlink' = 'link'
): AssistantLinkActionRecord {
	const base = {
		id: 'link-1',
		action: kind,
		headers:
			kind === 'link'
				? [
						{ text: '[Chorus]', occurrence: 1 },
						{ text: '[Chorus]', occurrence: 2 }
					]
				: [{ text: '[Chorus]', occurrence: 1 }],
		note: 'These copies repeat the same words.'
	};
	return status === 'failed'
		? { ...base, status, ...(reason ? { reason } : {}) }
		: ({ ...base, status } as AssistantLinkActionRecord);
}

function assistantStub() {
	return {
		approveLinkAction: vi.fn(async () => undefined),
		rejectLinkAction: vi.fn(async () => undefined)
	} as unknown as AssistantState;
}

afterEach(cleanup);

describe('an assistant section-link action card', () => {
	test('states the operation and note in words without an editor diff', () => {
		const { container } = render(AssistantLinkActionCard, {
			action: action(),
			assistant: assistantStub(),
			decidable: true
		});
		expect(container.textContent).toContain('Link [Chorus] and [Chorus] (2nd)');
		expect(container.textContent).toContain('These copies repeat the same words.');
		expect(container.querySelector('.assistant-proposal__diff')).toBeNull();
	});

	test('approve and reject call the store and settled outcomes replace the controls', async () => {
		const assistant = assistantStub();
		const view = render(AssistantLinkActionCard, { action: action(), assistant, decidable: true });

		await fireEvent.click(within(view.container).getByRole('button', { name: 'Approve' }));
		expect(assistant.approveLinkAction).toHaveBeenCalledWith('link-1');

		await view.rerender({ action: action('applied'), assistant, decidable: true });
		expect(view.container.textContent).toContain('Linked.');
		expect(within(view.container).queryByRole('button', { name: 'Approve' })).toBeNull();

		await view.rerender({
			action: action('pending', undefined, 'unlink'),
			assistant,
			decidable: true
		});
		expect(view.container.textContent).toContain('Unlink [Chorus]');
		await fireEvent.click(within(view.container).getByRole('button', { name: 'Reject' }));
		expect(assistant.rejectLinkAction).toHaveBeenCalledWith('link-1');
		await view.rerender({
			action: action('applied', undefined, 'unlink'),
			assistant,
			decidable: true
		});
		expect(view.container.textContent).toContain('Unlinked.');
	});

	test('an unresolvable action states why and offers no approval', () => {
		const view = render(AssistantLinkActionCard, {
			action: action('failed', 'not-linkable'),
			assistant: assistantStub(),
			decidable: true
		});
		expect(view.container.textContent).toContain('Failed.');
		expect(view.container.textContent).toContain('Only choruses');
		expect(within(view.container).queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(within(view.container).queryByRole('button', { name: 'Reject' })).toBeNull();
	});

	test('a pending action whose session is gone is history, not an offer', () => {
		const view = render(AssistantLinkActionCard, {
			action: action(),
			assistant: assistantStub(),
			decidable: false
		});
		expect(view.container.textContent).toContain('Left undecided.');
		expect(within(view.container).queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(within(view.container).queryByRole('button', { name: 'Reject' })).toBeNull();
	});
});
