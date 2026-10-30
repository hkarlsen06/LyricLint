import { fireEvent } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createAssistantState } from '#lib/assistant/assistant.svelte.js';
import { memoryRepository } from '#lib/assistant/assistant-test-utils.js';
import type { ReferenceDocument } from '#lib/reference/search.js';
import ReferenceIndex from './ReferenceIndex.svelte';
import {
	referenceSearchState,
	resetReferenceSearchState,
	setReferenceSearchState
} from './reference-search.svelte.js';

const corpus: ReferenceDocument[] = [
	{
		id: 'voices',
		kind: 'guideline',
		title: 'Credit each singer',
		href: '/guidelines/performers/#voices',
		topic: 'section-headers',
		topicTitle: 'Performers',
		summary: 'Identify the voice before the lyrics.',
		passages: ['Identify the voice before the lyrics.', 'Use a legend for two singers.'],
		aliases: ['duet'],
		relatedRuleIds: ['performers.legend']
	},
	{
		id: 'performers.legend',
		severity: 'warning',
		fixability: 'preview',
		kind: 'rule',
		title: 'A voice with no legend',
		href: '/guidelines/checks/performers-legend/',
		topic: 'section-headers',
		topicTitle: 'Performers',
		summary: 'Two singers need an identifying legend.',
		passages: ['Two singers need an identifying legend.'],
		aliases: [],
		relatedRuleIds: []
	},
	{
		id: 'spelling',
		severity: 'suggestion',
		fixability: 'safe',
		kind: 'rule',
		title: 'A common spelling error',
		href: '/guidelines/checks/spelling/',
		topic: 'spelling',
		topicTitle: 'Spelling',
		summary: 'Use the reviewed spelling.',
		passages: ['Use the reviewed spelling.', 'definately → definitely'],
		aliases: [],
		relatedRuleIds: []
	}
];

beforeEach(() => {
	vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', '');
	resetReferenceSearchState();
	history.replaceState(null, '', location.pathname);
});

afterEach(() => vi.unstubAllEnvs());

describe('ReferenceIndex', () => {
	it('keeps the topic directory stable when opening an article', async () => {
		const view = await render(ReferenceIndex, { corpus });
		const before = [...document.querySelectorAll('.reference-topics a')].map(
			(link) => link.textContent
		);
		await view.rerender({ corpus, selectedTopic: 'section-headers' });
		expect(
			[...document.querySelectorAll('.reference-topics a')].map((link) => link.textContent)
		).toEqual(before);
		expect(
			document.querySelector('.reference-topics a[aria-current="page"]')?.getAttribute('href')
		).toBe('/guidelines/section-headers/');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		await expect
			.element(page.getByRole('link', { name: 'Start with the essentials' }))
			.toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Read the whole guide' })).toBeVisible();
	});

	it('names each topic row by its title and describes it with quoted guide forms', async () => {
		await render(ReferenceIndex, { corpus });
		const performers = page.getByRole('link', {
			name: 'Section headers and performers',
			exact: true
		});
		await expect.element(performers).toHaveAccessibleDescription('Example: [Verse 1: Avery]');
		await expect
			.element(page.getByRole('link', { name: 'Spelling and contractions', exact: true }))
			.toHaveAccessibleDescription(/^Examples: okay\s*,\s*ballin'$/u);
		const preview = performers.element().querySelector('.reference-topic-preview');
		expect(preview?.textContent).toContain('[Verse 1: Avery]');
		expect(document.querySelectorAll('.reference-topics a')).toHaveLength(2);
	});

	it('wraps topic previews inside their rows on a 320px phone', async () => {
		await page.viewport(320, 700);
		const view = await render(ReferenceIndex, { corpus });
		try {
			for (const link of document.querySelectorAll<HTMLElement>('.reference-topics a')) {
				const row = link.getBoundingClientRect();
				const preview = link.querySelector('.reference-topic-preview')!.getBoundingClientRect();
				expect(preview.right).toBeLessThanOrEqual(row.right);
				expect(preview.top).toBeGreaterThanOrEqual(
					link.querySelector('.reference-topic-title')!.getBoundingClientRect().bottom
				);
			}
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
		} finally {
			await view.unmount();
			await page.viewport(800, 600);
		}
	});

	it('shows answer previews and keeps related checks available without duplicating results', async () => {
		await render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('two singers');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		expect(document.querySelector('.reference-description')?.textContent).toContain('two singers');
		await page.getByText('Related checks (1)', { exact: true }).click();
		await expect
			.element(page.getByRole('link', { name: 'A voice with no legend', exact: true }))
			.toBeVisible();
		expect(document.querySelector('.reference-related')?.textContent).not.toContain(
			'performers.legend'
		);
		await expect
			.element(page.getByRole('navigation', { name: 'Browse reference topics' }))
			.toBeVisible();
	});

	it('shows the matching spelling passage and preserves search in its destination', async () => {
		await render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('definately');
		expect(document.querySelector('.reference-description')?.textContent).toContain('definately');
		expect(document.querySelector('.reference-result > a')?.getAttribute('href')).toBe(
			'/guidelines/checks/spelling/?q=definately'
		);
	});

	it('filters checks and returns to the complete directory without changing topic selection', async () => {
		setReferenceSearchState({ scope: 'rules', browseAll: true });
		await render(ReferenceIndex, { corpus, selectedTopic: 'section-headers' });
		await page.getByRole('button', { name: 'Filters (active)', exact: true }).click();
		await page.getByRole('button', { name: 'Warnings', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		await page.getByRole('button', { name: 'Automatic fix', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		await expect.element(page.getByText(/No answers match yet/)).toBeVisible();
		await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
		expect(referenceSearchState().scope).toBe('all');
		expect(referenceSearchState().severities).toEqual([]);
		expect(document.querySelector('.reference-topics a[aria-current="page"]')).not.toBeNull();
	});

	it.each([1200, 390])('keeps search and disclosure triggers stable at %ipx', async (width) => {
		await page.viewport(width, 844);
		const view = await render(ReferenceIndex, { corpus });
		try {
			const input = document.querySelector<HTMLInputElement>('#reference-search')!;
			const toggle = document.querySelector<HTMLElement>('[aria-controls="reference-filters"]')!;
			const before = [input.getBoundingClientRect().y, toggle.getBoundingClientRect().y];
			await page.getByRole('button', { name: 'Filters', exact: true }).click();
			expect([input.getBoundingClientRect().y, toggle.getBoundingClientRect().y]).toEqual(before);
			expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
			await page.getByRole('searchbox').fill('two singers');
			const summary = document.querySelector<HTMLElement>('.reference-related summary')!;
			const top = summary.getBoundingClientRect().y;
			await page.getByText('Related checks (1)', { exact: true }).click();
			expect(summary.getBoundingClientRect().y).toBe(top);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
		} finally {
			await view.unmount();
			await page.viewport(800, 600);
		}
	});

	it('offers the assistant without sending a question or moving its control when filters expand', async () => {
		vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', 'https://example.test/answers');
		const repository = memoryRepository();
		const assistant = createAssistantState({
			repository: async () => repository,
			ruleSetVersion: 'test',
			corpusHash: 'a'.repeat(64),
			ask: async () => {
				throw new Error('Opening must not send a question');
			}
		});
		await render(ReferenceIndex, { corpus, assistant });
		const ask = document.querySelector<HTMLElement>('.reference-ask')!;
		const before = ask.getBoundingClientRect().y;
		await page.getByRole('button', { name: 'Filters', exact: true }).click();
		expect(ask.getBoundingClientRect().y).toBe(before);
		await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
		expect(assistant.isOpen).toBe(true);
	});

	it('keeps legacy topic fragments and meaningful highlighting', async () => {
		history.replaceState(null, '', `${location.pathname}#section`);
		await render(ReferenceIndex, { corpus });
		expect(document.querySelector('#section')?.closest('li')?.id).toBe('section-headers');
		await page.getByRole('searchbox').fill('How do I credit singers');
		const marked = [...document.querySelectorAll('.reference-results mark')].map((mark) =>
			mark.textContent?.toLowerCase()
		);
		expect(marked).toContain('credit');
		expect(marked).not.toContain('i');
		fireEvent.keyDown(document.querySelector('#reference-search')!, { key: 'Escape' });
		expect(referenceSearchState().query).toBe('');
		await expect.element(page.getByRole('searchbox')).toHaveFocus();
	});
});
