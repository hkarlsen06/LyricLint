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

	test('shows the revoke control only for a stored decision', async () => {
		const undecided = panelAssistant();
		const first = render(AssistantPanel, { assistant: undecided.assistant });
		expect(first.queryByRole('button', { name: /sharing this draft/i })).toBeNull();
		first.unmount();

		const granted = panelAssistant('granted');
		const second = render(AssistantPanel, { assistant: granted.assistant });
		const revoke = second.getByRole('button', { name: 'Stop sharing this draft' });
		expect(revoke.classList).toContain('button--quiet');
		expect(revoke.classList).toContain('button--flush');
		await fireEvent.click(revoke);
		expect(granted.revokeDraftAccess).toHaveBeenCalledOnce();
		second.unmount();

		const denied = panelAssistant('denied');
		const third = render(AssistantPanel, { assistant: denied.assistant });
		expect(
			third.getByRole('button', { name: 'Ask again before sharing this draft' })
		).not.toBeNull();
	});
});
