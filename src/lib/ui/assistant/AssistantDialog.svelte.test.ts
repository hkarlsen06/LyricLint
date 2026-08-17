import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import corpus from '../../../../services/rules-assistant/generated/rules-context.json';
import { cannedAnswer, memoryRepository } from '$lib/assistant/assistant-test-utils.js';
import { chatLockName } from '$lib/assistant/chat-lock.js';
import { createAssistantState, type AssistantDeps } from '$lib/assistant/assistant.svelte.js';
import { AssistantError, type StructuredAssistantAnswer } from '$lib/assistant/types.js';
import AssistantDialog from './AssistantDialog.svelte';

const RULE = corpus.rules.find((rule) => rule.id === 'syntax.unbalanced-brackets')!;
const EXAMPLE_RULE = corpus.rules.find((rule) => rule.id === 'unknown.improvised-marker')!;

function citedAnswer(): StructuredAssistantAnswer {
	return {
		scope: 'mixed',
		blocks: [
			{
				kind: 'prose',
				text: 'Genius wants every section header bracketed and closed.',
				ruleIds: [RULE.id],
				sourceIds: []
			},
			{
				// A rule cited only from an example block: its number has to be
				// drawn somewhere, or the card at the foot answers to nothing.
				kind: 'example',
				text: '[Verse\nI heard [?]',
				ruleIds: [EXAMPLE_RULE.id],
				sourceIds: []
			},
			{
				kind: 'general',
				text: 'More broadly, matching delimiters is a plain proofreading habit.',
				// The same rule cited twice, so the collected citations have a
				// duplicate to fold away.
				ruleIds: [RULE.id],
				sourceIds: []
			}
		]
	};
}

function makeAssistant(overrides: Partial<AssistantDeps> = {}) {
	const repository = memoryRepository();
	const ask = overrides.ask ?? vi.fn(async () => cannedAnswer(citedAnswer()));
	return createAssistantState({
		repository: async () => repository,
		ask,
		ruleSetVersion: corpus.ruleSetVersion,
		...overrides
	});
}

afterEach(cleanup);

describe('the assistant dialog', () => {
	test('citations collect once at the foot of the answer as compact rule cards', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('Why does my header need a closing bracket?');

		await waitFor(() => {
			expect(container.querySelector('.assistant-rule')).not.toBeNull();
		});

		// The card is a title over one meta line: severity, fix behavior, and the
		// reviewed source — all resolved from the local corpus, never from model
		// output. The raw rule id and the corpus explanation are deliberately
		// absent: both are the linter's voice, not an answer.
		const preview = container.querySelector('.assistant-rule')!;
		expect(preview.querySelector('.assistant-rule__title')!.textContent?.trim()).toBe(RULE.title);
		expect(preview.querySelector('.severity')).not.toBeNull();
		expect(preview.textContent).toContain('Fixed automatically');
		expect(preview.textContent).not.toContain(RULE.id);
		expect(preview.textContent).not.toContain(RULE.explanation);
		expect(preview.textContent).not.toContain('Attached rule');
		expect(preview.querySelector('pre')).toBeNull();
		const rulePage = preview.querySelector('a');
		expect(rulePage?.getAttribute('href')?.endsWith(`/${RULE.slug}/`)).toBe(true);
		expect(rulePage?.getAttribute('target')).toBe('_blank');
		expect(rulePage?.getAttribute('rel')).toBe('noopener noreferrer');

		// The rule's reviewed source rides the meta line, linked, with the cited
		// section and its verified date in the link's tooltip — the citation
		// idiom the diagnostic card uses.
		const sourceLink = preview.querySelector('a.assistant-rule__source');
		expect(sourceLink?.textContent).toContain('Use song part headers');
		expect(sourceLink?.getAttribute('title')).toContain('verified');

		// Two rules cited across three blocks — one of them twice — and the
		// collected section draws each once, after the whole answer: a card
		// after every paragraph chopped the answer into fragments.
		expect(container.querySelectorAll('.assistant-rule')).toHaveLength(2);
		expect(container.textContent).toContain('Cited rules');
		const blocks = [...container.querySelectorAll('.assistant-block, .assistant-rule')];
		expect(blocks.map((node) => node.className.includes('assistant-rule'))).toEqual([
			false,
			false,
			false,
			true,
			true
		]);

		// The tie between a passage and its rule is a superscript number. The
		// first and last blocks cite rule 1; the example block cites rule 2, and
		// its mark rides the example's own corner — dropping example marks is how
		// a number went missing from a real answer.
		const refs = container.querySelectorAll('.assistant-block__refs');
		expect(refs).toHaveLength(3);
		expect(refs[0]!.textContent).toBe('1');
		expect(refs[1]!.textContent).toBe('2');
		expect(refs[2]!.textContent).toBe('1');
		expect(container.querySelector('.assistant-example .assistant-block__refs')).toBe(refs[1]);
		const cardNumbers = [...container.querySelectorAll('.assistant-rule')].map(
			(card) => card.querySelector('.assistant-citation-number')?.textContent
		);
		expect(cardNumbers).toEqual(['1', '2']);
	});

	test('a pending answer shows the shared loading mark, labelled Answering', async () => {
		let release!: (value: ReturnType<typeof cannedAnswer>) => void;
		const ask = vi.fn(
			() => new Promise<ReturnType<typeof cannedAnswer>>((resolve) => (release = resolve))
		);
		const assistant = makeAssistant({ ask });
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		const sending = assistant.send('Slow question?');
		await waitFor(() => expect(ask).toHaveBeenCalled());
		// The application's one wait-with-no-measurable-end indicator, not a second
		// one of this surface's own — which is also what keeps it moving under
		// `prefers-reduced-motion` rather than freezing into a drawing.
		await waitFor(() => expect(container.querySelector('.loading-mark')).not.toBeNull());
		expect(container.querySelector('.loading-mark [role="status"]')!.textContent).toBe('Answering');
		release(cannedAnswer(citedAnswer()));
		await sending;
	});

	test('the transcript is a log, and completion is announced by a region that was already mounted', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();

		// `log`, not a bare div carrying an aria-label nothing reads.
		expect(container.querySelector('.assistant-transcript')!.getAttribute('role')).toBe('log');

		// Mounted empty and filled, never inserted already carrying its text: an
		// element born with content is an addition to the accessibility tree
		// rather than a change inside a live region.
		const status = container.querySelector('[data-testid="assistant-announcement"]')!;
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent).toBe('');

		await assistant.send('Why does my header need a closing bracket?');
		await waitFor(() => expect(status.textContent).toBe('Answer ready'));
		// One channel per event: the transcript's own log does not also say this.
		expect(container.querySelector('.assistant-transcript')!.textContent).not.toContain(
			'Answer ready'
		);
	});

	test('the composer sends through the shared control tiers, not a fourth one', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();

		// There are exactly three tiers, and the composer's one destination action
		// takes the top of them rather than a theme-inverting silhouette of its own.
		const send = container.querySelector('.assistant-composer__send')!;
		expect([...send.classList]).toEqual(
			expect.arrayContaining(['icon-button', 'button--contrast'])
		);
	});

	test('general guidance is labelled and never grows a rule preview', async () => {
		const assistant = makeAssistant({
			ask: vi.fn(async () =>
				cannedAnswer({
					scope: 'general',
					blocks: [{ kind: 'general', text: 'A broad grammar note.', ruleIds: [], sourceIds: [] }]
				})
			)
		});
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('Is this grammatical?');
		await waitFor(() => {
			expect(container.textContent).toContain('General language guidance');
		});
		expect(container.querySelector('.assistant-rule')).toBeNull();
	});

	test('a direct reviewed-source citation resolves to local canonical metadata', async () => {
		const source = corpus.sources[0]!;
		const assistant = makeAssistant({
			ask: vi.fn(async () =>
				cannedAnswer({
					scope: 'reviewed',
					blocks: [
						{
							kind: 'prose',
							text: 'The reviewed source establishes this point.',
							ruleIds: [],
							sourceIds: [source.id]
						}
					]
				})
			)
		});
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('What does the source say?');
		await waitFor(() =>
			expect(container.querySelector('.assistant-block__sources')).not.toBeNull()
		);
		const citation = container.querySelector('.assistant-block__sources')!;
		expect(citation.textContent).toContain(source.pageTitle);
		expect(citation.textContent).toContain(source.sectionTitle);
		expect(citation.textContent).toContain(source.lastVerifiedAt);
		expect(citation.querySelector('a')?.getAttribute('href')).toBe(source.url);
	});

	test('a failed answer offers a retry that lands in place', async () => {
		const ask = vi
			.fn()
			.mockRejectedValueOnce(new AssistantError('provider_error'))
			.mockResolvedValue(cannedAnswer(citedAnswer()));
		const assistant = makeAssistant({ ask });
		const { container, getByRole } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('Question?');
		await waitFor(() => {
			expect(container.textContent).toContain('did not get an answer');
		});
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		await waitFor(() => {
			expect(container.querySelector('.assistant-rule')).not.toBeNull();
		});
	});

	test('the composer sends through the form and disables while busy', async () => {
		const assistant = makeAssistant();
		const { container, getByRole, getByLabelText } = render(AssistantDialog, { assistant });
		await assistant.open();
		const textarea = getByLabelText('Your question') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'How do I mark a chorus?' } });
		await fireEvent.submit(container.querySelector('form.assistant-composer')!);
		await waitFor(() => {
			expect(container.textContent).toContain('How do I mark a chorus?');
			expect(container.querySelector('.assistant-rule')).not.toBeNull();
		});
		expect((getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
	});

	test('a conversation held by another tab hands the question back to the composer', async () => {
		// The busy guard preserves the draft synchronously; the cross-tab refusal
		// is only discoverable after the lock probe, so the composer clears first
		// and has to restore itself when `send` reports nothing was consumed.
		const held = new Set<string>();
		const locks = {
			async request(
				name: string,
				_options: unknown,
				callback: (lock: { name: string } | null) => unknown
			) {
				if (held.has(name)) return callback(null);
				held.add(name);
				try {
					return await callback({ name });
				} finally {
					held.delete(name);
				}
			}
		} as unknown as LockManager;
		const assistant = makeAssistant({ locks });
		const { container, getByLabelText } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('First question?');
		await waitFor(() => expect(assistant.chats).toHaveLength(1));

		held.add(chatLockName(assistant.chats[0]!.id));
		const textarea = getByLabelText('Your question') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'A second thought' } });
		await fireEvent.submit(container.querySelector('form.assistant-composer')!);

		await waitFor(() =>
			expect(container.textContent).toContain('This conversation is answering in another tab.')
		);
		expect(textarea.value).toBe('A second thought');
	});

	test('quota and offline states are stated in words', async () => {
		const assistant = makeAssistant({
			ask: vi
				.fn()
				.mockResolvedValueOnce(
					cannedAnswer(citedAnswer(), {
						browserRemaining: 2,
						ipRemaining: 70,
						resetsAt: '2026-08-02T00:00:00.000Z'
					})
				)
				.mockRejectedValue(new AssistantError('offline'))
		});
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('First?');
		await waitFor(() => {
			expect(container.textContent).toContain('2 questions left today');
		});
		await assistant.send('Second?');
		await waitFor(() => {
			expect(container.textContent).toContain('You are offline');
		});
	});

	test('user turns are bubbles, assistant turns are prose, and no visible role captions remain', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('How do I mark a chorus?');
		await waitFor(() => {
			expect(container.querySelector('.assistant-rule')).not.toBeNull();
		});

		// Whose turn it is is carried by layout, not by a printed "You"/"Assistant"
		// caption — those stay sr-only for readers who cannot see the layout.
		const userTurn = container.querySelector('.assistant-turn[data-role="user"]')!;
		expect(userTurn.textContent).toContain('How do I mark a chorus?');
		expect(userTurn.querySelector('.sr-only')?.textContent).toContain('You');
		const assistantTurn = container.querySelector('.assistant-turn[data-role="assistant"]')!;
		expect(assistantTurn.querySelector('.sr-only')?.textContent).toContain('Assistant');
		expect(container.querySelector('.assistant-turn__meta')).toBeNull();
	});

	test('conversations live in a popover, and deleting one is a confirm in the row', async () => {
		const assistant = makeAssistant();
		const { container, getByRole, queryByRole } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('First question?');
		await waitFor(() => expect(assistant.chats).toHaveLength(1));

		// The header carries no bare `Delete` acting on the whole conversation.
		expect(queryByRole('button', { name: /^Delete chat/ })).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Conversations' }));
		const row = container.querySelector('.assistant-chats__list .list-row')!;
		expect(row.textContent).toContain('First question?');

		// Two presses in one place: the trash arms a confirm that takes its slot.
		// The live region has to be the SAME node across the arming — a region
		// mounted already holding the question announces nothing.
		const liveRegion = row.querySelector('[aria-live]')!;
		expect(liveRegion.textContent?.trim()).toBe('');
		await fireEvent.click(getByRole('button', { name: 'Delete First question?' }));
		expect(row.querySelector('[aria-live]')).toBe(liveRegion);
		expect(liveRegion.textContent).toContain('Delete First question?');
		expect([...row.querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual(
			['Cancel', 'Delete']
		);
		// The confirm carries the subject in its accessible name — focus lands on
		// it the moment it is armed, and a bare "Delete" would point at nothing.
		await fireEvent.click(getByRole('button', { name: 'Delete First question?' }));
		await waitFor(() => expect(assistant.chats).toHaveLength(0));
		expect(container.querySelector('.assistant-chats')).toBeNull();
		expect(container.textContent).toContain('What would you like to check?');
	});

	test('the transcript never contains draft text and the disclosure names the boundary', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		expect(container.querySelector('.assistant-conversation')).not.toBeNull();
		expect(container.textContent).toContain("cannot see your 'scribe");
		expect(container.querySelector('.assistant-empty .assistant-disclosure a')).not.toBeNull();
		expect(
			container.querySelector('.assistant-conversation__foot .assistant-disclosure')
		).toBeNull();
	});
});
