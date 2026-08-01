import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import corpus from '../../../../services/rules-assistant/generated/rules-context.json';
import { cannedAnswer, memoryRepository } from '$lib/assistant/assistant-test-utils.js';
import { createAssistantState, type AssistantDeps } from '$lib/assistant/assistant.svelte.js';
import { AssistantError, type StructuredAssistantAnswer } from '$lib/assistant/types.js';
import AssistantDialog from './AssistantDialog.svelte';

const RULE = corpus.rules.find((rule) => rule.id === 'syntax.unbalanced-brackets')!;

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
				kind: 'general',
				text: 'More broadly, matching delimiters is a plain proofreading habit.',
				ruleIds: [],
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
	test('a sent question renders a compact rule attachment after its passage', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		await assistant.send('Why does my header need a closing bracket?');

		await waitFor(() => {
			expect(container.querySelector('.assistant-rule')).not.toBeNull();
		});

		// The compact attachment identifies the canonical local rule and sends the
		// complete reference to a new tab.
		const preview = container.querySelector('.assistant-rule')!;
		expect(preview.querySelector('.assistant-rule__title')!.textContent?.trim()).toBe(RULE.title);
		expect(preview.textContent).toContain(RULE.id);
		expect(preview.textContent).toContain('Attached rule');
		expect(preview.textContent).toContain('Fixed automatically');
		expect(preview.textContent).not.toContain(RULE.explanation);
		expect(preview.querySelector('pre')).toBeNull();
		const rulePage = preview.querySelector('a');
		expect(rulePage?.getAttribute('href')).toContain(RULE.slug);
		expect(rulePage?.getAttribute('target')).toBe('_blank');
		expect(rulePage?.getAttribute('rel')).toBe('noopener noreferrer');

		// The preview sits directly after the block that cited it, before the
		// general block that follows.
		const blocks = [...container.querySelectorAll('.assistant-block, .assistant-rule')];
		expect(blocks.map((node) => node.className.includes('assistant-rule'))).toEqual([
			false,
			true,
			false
		]);
	});

	test('a pending answer shows a bouncing three-dot status', async () => {
		let release!: (value: ReturnType<typeof cannedAnswer>) => void;
		const ask = vi.fn(
			() => new Promise<ReturnType<typeof cannedAnswer>>((resolve) => (release = resolve))
		);
		const assistant = makeAssistant({ ask });
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		const sending = assistant.send('Slow question?');
		await waitFor(() => expect(ask).toHaveBeenCalled());
		await waitFor(() =>
			expect(container.querySelectorAll('.assistant-thinking i')).toHaveLength(3)
		);
		release(cannedAnswer(citedAnswer()));
		await sending;
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

	test('the transcript never contains draft text and the disclosure names the boundary', async () => {
		const assistant = makeAssistant();
		const { container } = render(AssistantDialog, { assistant });
		await assistant.open();
		expect(container.textContent).toContain('cannot see your draft');
		expect(container.querySelector('.assistant-disclosure a')).not.toBeNull();
	});
});
