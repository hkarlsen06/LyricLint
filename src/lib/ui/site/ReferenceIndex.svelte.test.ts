import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createAssistantState } from '$lib/assistant/assistant.svelte.js';
import { memoryRepository } from '$lib/assistant/assistant-test-utils.js';
import type { ReferenceDocument } from '$lib/reference/search.js';
import ReferenceIndex from './ReferenceIndex.svelte';
import {
	referenceSearchState,
	resetReferenceSearchState,
	setReferenceSearchState
} from './reference-search.svelte.js';
import { setReadingAnchor } from './guidance-reading.svelte.js';

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
	setReadingAnchor('');
	history.replaceState(null, '', location.pathname);
});

afterEach(() => vi.unstubAllEnvs());

describe('ReferenceIndex', () => {
	it('starts with a compact topic directory and exposes entries only after a choice', async () => {
		render(ReferenceIndex, { corpus });
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		expect(document.querySelector('.reference-topics a svg[aria-hidden="true"]')).not.toBeNull();
		expect(document.querySelector('.reference-topics .reference-description')).toBeNull();
		expect(document.querySelector('.reference-topics a')?.getAttribute('href')).toBe(
			'/guidelines/section-headers/'
		);
		expect(document.querySelector('[aria-label="Search scope"]')).toBeNull();
		await page.getByRole('button', { name: 'Browse all', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(2);
		await page.getByRole('button', { name: 'Browse topics', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
	});

	it('searches conventions and checks together, groups related checks and shows the matching passage', async () => {
		render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('two singers');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		await expect.element(page.getByText('Use a legend for two singers.')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'A voice with no legend', exact: true }))
			.toBeVisible();
		expect(document.querySelector('.reference-related')?.textContent).not.toContain(
			'performers.legend'
		);
		await page.getByText('Filters', { exact: true }).click();
		await page.getByRole('combobox', { name: 'Content', exact: true }).selectOptions('rules');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		expect(document.querySelector('.reference-result')?.textContent).toContain(
			'A voice with no legend'
		);
	});

	it('shows the matching lookup row and preserves lookup state in result links', async () => {
		render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('definately');
		expect(document.querySelector('.reference-result')?.textContent).toContain(
			'definately → definitely'
		);
		expect(document.querySelector('.reference-result')?.getAttribute('href')).toContain(
			'q=definately'
		);
		await page.getByRole('searchbox').fill('noexistingword');
		await expect
			.element(
				page.getByText(
					'No results match. Try a shorter phrase, another topic, or clear the filters.'
				)
			)
			.toBeVisible();
		await page.getByRole('button', { name: 'Clear search' }).click();
		expect(referenceSearchState().query).toBe('');
	});

	it('marks the reading position without changing an active search', async () => {
		setReferenceSearchState({ query: 'two singers' });
		setReadingAnchor('voices');
		render(ReferenceIndex, { corpus, selectedTopic: 'performers' });
		await expect
			.element(page.getByRole('link', { name: /Credit each singer/ }))
			.toHaveAttribute('aria-current', 'page');
		expect(referenceSearchState().query).toBe('two singers');
		expect(document.querySelector('button.reference-ask')).toBeNull();
	});
	it('narrows linter checks by severity and fix type without changing the query', async () => {
		setReferenceSearchState({ scope: 'rules', browseAll: true });
		render(ReferenceIndex, { corpus });
		await page.getByText('Filters (active)', { exact: true }).click();
		await page.getByRole('button', { name: 'Warnings', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		expect(document.querySelector('.reference-result')?.textContent).toContain(
			'A voice with no legend'
		);
		await page.getByRole('button', { name: 'Automatic fix', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		expect(referenceSearchState().query).toBe('');
	});

	it('reveals a deep-linked rule and lets All topics override its implicit topic', async () => {
		render(ReferenceIndex, { corpus, selectedSlug: 'performers-legend' });
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			'A voice with no legend'
		);
		expect(referenceSearchState().topic).toBe('');
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain('(current)');
		await page.getByText('Filters', { exact: true }).click();
		await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOptions('');
		expect(referenceSearchState().browseAll).toBe(true);
		expect(document.querySelectorAll('.reference-result')).toHaveLength(2);
	});
	it('offers a labelled question entrance when the assistant is available', async () => {
		vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', 'https://example.test/answers');
		const repository = memoryRepository();
		const assistant = createAssistantState({
			repository: async () => repository,
			ruleSetVersion: 'test',
			ask: async () => {
				throw new Error('Opening must not send a question');
			}
		});
		render(ReferenceIndex, { corpus, assistant });
		await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
		expect(assistant.isOpen).toBe(true);
	});
	it('marks useful search words without highlighting question stopwords', async () => {
		render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('How do I credit singers');
		const marked = [...document.querySelectorAll('.reference-results mark')].map((mark) =>
			mark.textContent?.toLowerCase()
		);
		expect(marked).toContain('credit');
		expect(marked).not.toContain('i');
	});
	it('lands a legacy rule-family fragment on the corresponding topic without moving focus', async () => {
		history.replaceState(null, '', `${location.pathname}#section`);
		const focused = document.activeElement;
		render(ReferenceIndex, { corpus });
		await expect
			.element(page.getByRole('link', { name: 'Section headers and performers' }))
			.toBeVisible();
		expect(document.querySelector('#section')?.closest('li')?.id).toBe('section-headers');
		expect(document.querySelector('#section-headers')?.hasAttribute('data-fragment-current')).toBe(
			true
		);
		expect(document.activeElement).toBe(focused);
	});
});
