import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { AssistantProposalRecord } from '$lib/assistant/types.js';
import { acquirePreview } from '$lib/diagnostics/preview-slot.js';
import AssistantProposalCard from './AssistantProposalCard.svelte';

function proposal(
	status: AssistantProposalRecord['status'] = 'pending',
	reason?: string
): AssistantProposalRecord {
	const base = {
		id: 'proposal-1',
		anchor: {
			exact: 'This is a deliberately long opening before the old words and a closing line.',
			before: '',
			after: ''
		},
		replacement: 'This is a deliberately long opening before the new lines and a closing line.',
		note: 'Use the wording consistently.'
	};
	if (status === 'failed') return { ...base, status, ...(reason ? { reason } : {}) };
	return { ...base, status } as AssistantProposalRecord;
}

function assistantStub() {
	return {
		previewProposal: vi.fn(() => true),
		endProposalPreview: vi.fn(),
		approveProposal: vi.fn(async () => undefined),
		rejectProposal: vi.fn(async () => undefined)
	} as unknown as AssistantState;
}

afterEach(cleanup);

describe('an assistant proposal card', () => {
	test('renders deletion, insertion, and muted context as a wrapping non-control diff', () => {
		const assistant = assistantStub();
		const { container } = render(AssistantProposalCard, {
			proposal: proposal(),
			assistant,
			decidable: true
		});
		const diff = container.querySelector<HTMLElement>('.assistant-proposal__diff')!;
		const deletion = diff.querySelector('del')!;
		const insertion = diff.querySelector('ins')!;

		expect(deletion.textContent).toContain('old words');
		expect(insertion.textContent).toContain('new lines');
		expect(diff.querySelector('.assistant-proposal__context')?.textContent).toMatch(/^…/);
		expect(diff.querySelector('button')).toBeNull();
		expect(getComputedStyle(diff).whiteSpace).toBe('pre-wrap');
		expect(getComputedStyle(deletion).textDecorationLine).toContain('line-through');
		expect(getComputedStyle(insertion).textDecorationLine).toContain('underline');
		expect(container.querySelector('.assistant-proposal__note')?.textContent).toContain(
			'Use the wording consistently.'
		);
	});

	test('hover borrows the preview slot and leave or unmount hands it back', async () => {
		const backgroundShow = vi.fn();
		const backgroundEmpty = vi.fn();
		const releaseBackground = acquirePreview(backgroundShow, backgroundEmpty);
		const assistant = assistantStub();
		const view = render(AssistantProposalCard, {
			proposal: proposal(),
			assistant,
			decidable: true
		});
		const card = view.container.querySelector('.assistant-proposal')!;

		await fireEvent.pointerEnter(card);
		expect(assistant.previewProposal).toHaveBeenCalledWith('proposal-1');
		await fireEvent.pointerLeave(card);
		expect(backgroundShow).toHaveBeenCalledTimes(2);

		await fireEvent.pointerEnter(card);
		view.unmount();
		expect(backgroundShow).toHaveBeenCalledTimes(3);

		releaseBackground();
		expect(backgroundEmpty).toHaveBeenCalledOnce();
	});

	test('clears the editor when it is the last preview owner', async () => {
		const assistant = assistantStub();
		const { container } = render(AssistantProposalCard, {
			proposal: proposal(),
			assistant,
			decidable: true
		});
		const card = container.querySelector('.assistant-proposal')!;

		await fireEvent.pointerEnter(card);
		await fireEvent.pointerLeave(card);
		expect(assistant.endProposalPreview).toHaveBeenCalledWith('proposal-1');
	});

	test('approve and reject call the store, and outcomes replace both controls', async () => {
		const assistant = assistantStub();
		const view = render(AssistantProposalCard, {
			proposal: proposal(),
			assistant,
			decidable: true
		});

		await fireEvent.click(view.getByRole('button', { name: 'Approve' }));
		expect(assistant.approveProposal).toHaveBeenCalledWith('proposal-1');

		await view.rerender({ proposal: proposal('applied'), assistant, decidable: true });
		expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(view.queryByRole('button', { name: 'Reject' })).toBeNull();
		expect(view.container.textContent).toContain('Applied.');

		await view.rerender({ proposal: proposal(), assistant, decidable: true });
		await fireEvent.click(view.getByRole('button', { name: 'Reject' }));
		expect(assistant.rejectProposal).toHaveBeenCalledWith('proposal-1');
		await view.rerender({ proposal: proposal('rejected'), assistant, decidable: true });
		expect(view.container.textContent).toContain('Rejected.');
		expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
	});

	test('an unresolvable proposal states why and offers no approval', () => {
		const assistant = assistantStub();
		const { container, queryByRole } = render(AssistantProposalCard, {
			proposal: proposal('failed', 'ambiguous'),
			assistant,
			decidable: true
		});

		expect(container.textContent).toContain('Failed.');
		expect(container.textContent).toContain('appears more than once');
		expect(queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(queryByRole('button', { name: 'Reject' })).toBeNull();
	});

	test('a pending proposal whose session is gone is history, not an offer', async () => {
		// A transcript restored from a previous session redraws its cards from
		// the record, and the record cannot say whether anything can still act on
		// them. `pendingProposal` refuses without a live session, so Approve here
		// would be a control that silently does nothing.
		const assistant = assistantStub();
		const { container, queryByRole } = render(AssistantProposalCard, {
			proposal: proposal(),
			assistant,
			decidable: false
		});

		expect(queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(queryByRole('button', { name: 'Reject' })).toBeNull();
		expect(container.textContent).toContain('Left undecided.');
		// The diff is still worth reading; only the offer went.
		expect(container.querySelector('.assistant-proposal__diff')).not.toBeNull();

		// And it does not take the preview slot for an edit it cannot apply.
		await fireEvent.pointerEnter(container.querySelector('.assistant-proposal')!);
		expect(assistant.previewProposal).not.toHaveBeenCalled();
	});
});
