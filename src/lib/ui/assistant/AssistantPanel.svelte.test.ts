import { fireEvent, screen, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { DraftAccessDecision } from '$lib/assistant/permissions.js';
import AssistantPanel from './AssistantPanel.svelte';

function panelAssistant(
	decision?: DraftAccessDecision,
	messages: unknown[] = [],
	toolSession?: { assistantMessageId: string; phase: string }
) {
	const revokeDraftAccess = vi.fn(async () => undefined);
	const send = vi.fn(async () => undefined);
	const assistant = {
		messages,
		quota: undefined,
		failure: undefined,
		challengePending: false,
		busy: false,
		contextDividerIndex: undefined,
		toolSession,
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
		send,
		newChat: vi.fn(async () => undefined),
		selectChat: vi.fn(async () => undefined),
		deleteChat: vi.fn(async () => undefined),
		submitChallenge: vi.fn(async () => undefined),
		ensureLoaded: vi.fn(async () => undefined),
		revokeDraftAccess
	} as unknown as AssistantState;
	return { assistant, revokeDraftAccess, send };
}

/** A transcript long enough to overflow the pane it is rendered into. */
function transcriptOf(turns: number): unknown[] {
	return Array.from({ length: turns }, (_, index) => ({
		id: `message-${index}`,
		role: 'user',
		content: `Question ${index} about how a chorus header should be written out.`,
		status: 'complete'
	}));
}

/**
 * Three frames. A `ResizeObserver` delivers after the frame's animation
 * callbacks, so the follow it schedules is a frame behind the resize that
 * caused it, and a frame behind that again before this continuation is reached.
 */
function frames(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	});
}

/**
 * How far the foot is, in whole pixels. Fractional layout — this transcript is
 * text at the workbench's own ramp, not round boxes — rounds `scrollHeight` and
 * `clientHeight` independently, so a transcript scrolled all the way down still
 * reports a pixel of slack. That pixel is the reason the rule has a threshold at
 * all, and it is what these read against rather than an exact zero.
 */
function distanceFromBottom(node: HTMLElement): number {
	return node.scrollHeight - node.clientHeight - node.scrollTop;
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
		const { container } = render(AssistantPanel, { assistant });
		const panel = container.querySelector<HTMLElement>('.assistant-panel')!;
		panel.style.width = '21rem';
		panel.style.overflow = 'hidden';

		await fireEvent.click(screen.getByRole('button', { name: 'Conversations' }));

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

	/**
	 * `stick-to-bottom.svelte.test.ts` pins the rule itself. What these two pin is
	 * that the transcript is the element it is attached to, and that asking a
	 * question is one of the gestures that takes the pin back — the wiring, which
	 * is what silently goes missing when this markup is rearranged.
	 */
	test('opens a stored transcript at its foot and follows an answer as it arrives', async () => {
		const { assistant } = panelAssistant(undefined, transcriptOf(20));
		const { container } = render(AssistantPanel, { assistant });
		container.querySelector<HTMLElement>('.assistant-panel')!.style.height = '320px';
		const transcript = container.querySelector<HTMLElement>('.assistant-transcript')!;
		await frames();

		expect(transcript.scrollHeight).toBeGreaterThan(transcript.clientHeight);
		expect(distanceFromBottom(transcript)).toBeLessThanOrEqual(1);

		// A token landing at the foot of the answer being written.
		transcript.querySelector('.assistant-turn:last-child p')!.textContent =
			'A much longer answer than the one that was there a moment ago, '.repeat(12);
		await frames();

		expect(distanceFromBottom(transcript)).toBeLessThanOrEqual(1);
	});

	test('leaves a reader who has scrolled up alone until they ask something', async () => {
		const { assistant, send } = panelAssistant(undefined, transcriptOf(20));
		const { container } = render(AssistantPanel, { assistant });
		container.querySelector<HTMLElement>('.assistant-panel')!.style.height = '320px';
		const transcript = container.querySelector<HTMLElement>('.assistant-transcript')!;
		await frames();

		transcript.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true }));
		transcript.scrollTop -= 200;
		transcript.dispatchEvent(new Event('scroll'));
		const readingAt = transcript.scrollTop;

		transcript.querySelector('.assistant-turn:last-child p')!.textContent =
			'The answer carries on underneath them. '.repeat(12);
		await frames();

		expect(transcript.scrollTop).toBe(readingAt);

		const composer = container.querySelector<HTMLTextAreaElement>('#assistant-question')!;
		await fireEvent.input(composer, { target: { value: 'And what about a pre-chorus?' } });
		await fireEvent.submit(container.querySelector('.assistant-composer')!);
		await frames();

		expect(send).toHaveBeenCalledWith('And what about a pre-chorus?');
		expect(distanceFromBottom(transcript)).toBeLessThanOrEqual(1);
	});

	/**
	 * `send()` refuses while a tool turn is waiting on a decision, and both submit
	 * paths clear the composer before asking — so a question typed during a review
	 * was destroyed and never sent, with nothing on screen saying why. The Enter
	 * key is where it was actually lost: the send button already refused two of
	 * the three refusal states, and the key consulted none of them.
	 */
	test('keeps a question typed while a tool turn is awaiting review', async () => {
		const { assistant, send } = panelAssistant(undefined, [], {
			assistantMessageId: 'message-0',
			phase: 'awaiting-review'
		});
		const { container } = render(AssistantPanel, { assistant });
		const composer = container.querySelector<HTMLTextAreaElement>('#assistant-question')!;

		await fireEvent.input(composer, { target: { value: 'And what about a pre-chorus?' } });
		await fireEvent.keyDown(composer, { key: 'Enter' });

		expect(composer.value).toBe('And what about a pre-chorus?');
		expect(send).not.toHaveBeenCalled();
		// The button says the same thing the key now does.
		expect(container.querySelector<HTMLButtonElement>('.assistant-composer__send')!.disabled).toBe(
			true
		);
	});

	test('shows the revoke control only for a stored decision', async () => {
		const undecided = panelAssistant();
		const first = render(AssistantPanel, { assistant: undecided.assistant });
		expect(
			within(first.container).queryByRole('button', { name: /sharing this 'scribe/i })
		).toBeNull();
		first.unmount();

		const granted = panelAssistant('granted');
		const second = render(AssistantPanel, { assistant: granted.assistant });
		const revoke = within(second.container).getByRole('button', {
			name: "Stop sharing this 'scribe"
		});
		expect(revoke.classList).toContain('button--quiet');
		expect(revoke.classList).toContain('button--flush');
		await fireEvent.click(revoke);
		expect(granted.revokeDraftAccess).toHaveBeenCalledOnce();
		second.unmount();

		const denied = panelAssistant('denied');
		const third = render(AssistantPanel, { assistant: denied.assistant });
		expect(
			within(third.container).getByRole('button', {
				name: "Ask again before sharing this 'scribe"
			})
		).not.toBeNull();
	});
});
