import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { DraftAccessDecision } from '$lib/assistant/permissions.js';
import AssistantPanel from './AssistantPanel.svelte';

function panelAssistant(decision?: DraftAccessDecision) {
	const revokeDraftAccess = vi.fn(async () => undefined);
	const assistant = {
		messages: [],
		quota: undefined,
		failure: undefined,
		challengePending: false,
		busy: false,
		contextDividerIndex: undefined,
		toolSession: undefined,
		chats: [
			{
				id: 'chat-1',
				title: 'Chorus question',
				createdAt: '2026-08-02T10:00:00.000Z',
				updatedAt: '2026-08-02T10:00:00.000Z',
				ruleSetVersion: 'test'
			}
		],
		draftToolsAvailable: true,
		draftAccessState: decision,
		send: vi.fn(async () => undefined),
		newChat: vi.fn(async () => undefined),
		selectChat: vi.fn(async () => undefined),
		deleteChat: vi.fn(async () => undefined),
		submitChallenge: vi.fn(async () => undefined),
		ensureLoaded: vi.fn(async () => undefined),
		revokeDraftAccess
	} as unknown as AssistantState;
	return { assistant, revokeDraftAccess };
}

function declaredMarginTop(selector: string): string | undefined {
	for (const sheet of document.styleSheets) {
		for (const rule of [...sheet.cssRules]) {
			if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
				return rule.style.marginTop;
			}
		}
	}
	return undefined;
}

afterEach(cleanup);

describe('the assistant panel', () => {
	test('fills the pane, pins the composer at its foot, and carries both chat controls', () => {
		const { assistant } = panelAssistant();
		const { container } = render(AssistantPanel, { assistant });
		const panel = container.querySelector<HTMLElement>('.assistant-panel')!;
		const conversation = container.querySelector<HTMLElement>('.assistant-conversation')!;
		const foot = container.querySelector<HTMLElement>('.assistant-conversation__foot')!;

		expect(getComputedStyle(panel).display).toBe('flex');
		expect(getComputedStyle(conversation).flexDirection).toBe('column');
		expect(declaredMarginTop('.assistant-conversation__foot')).toBe('auto');
		expect(foot.querySelector('.assistant-composer')).not.toBeNull();
		expect(foot.querySelector('.assistant-disclosure')).toBeNull();
		expect(container.querySelector('.assistant-empty .assistant-disclosure')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'New chat' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Conversations' })).not.toBeNull();
	});

	test('keeps the conversations popover inside the narrow panel', async () => {
		const { assistant } = panelAssistant();
		const { container, getByRole } = render(AssistantPanel, { assistant });
		const panel = container.querySelector<HTMLElement>('.assistant-panel')!;
		panel.style.width = '21rem';
		panel.style.overflow = 'hidden';

		await fireEvent.click(getByRole('button', { name: 'Conversations' }));

		const panelBox = panel.getBoundingClientRect();
		const popoverBox = container
			.querySelector<HTMLElement>('.assistant-chats__popover')!
			.getBoundingClientRect();
		expect(popoverBox.left).toBeGreaterThanOrEqual(panelBox.left);
		expect(popoverBox.right).toBeLessThanOrEqual(panelBox.right);
		expect(container.querySelector('.assistant-chats')!.getBoundingClientRect().right).toBe(
			popoverBox.right
		);
	});

	test('shows the revoke control only for a stored decision', async () => {
		const undecided = panelAssistant();
		const first = render(AssistantPanel, { assistant: undecided.assistant });
		expect(first.queryByRole('button', { name: /sharing this 'scribe/i })).toBeNull();
		first.unmount();

		const granted = panelAssistant('granted');
		const second = render(AssistantPanel, { assistant: granted.assistant });
		const revoke = second.getByRole('button', { name: "Stop sharing this 'scribe" });
		expect(revoke.classList).toContain('button--quiet');
		expect(revoke.classList).toContain('button--flush');
		await fireEvent.click(revoke);
		expect(granted.revokeDraftAccess).toHaveBeenCalledOnce();
		second.unmount();

		const denied = panelAssistant('denied');
		const third = render(AssistantPanel, { assistant: denied.assistant });
		expect(
			third.getByRole('button', { name: "Ask again before sharing this 'scribe" })
		).not.toBeNull();
	});
});
