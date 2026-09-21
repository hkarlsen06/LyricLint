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
	it('keeps all topics beside an article and follows entries outside its arrival topic', async () => {
		const other = {
			...corpus[0]!,
			id: 'other',
			topic: 'spelling' as const,
			topicTitle: 'Spelling',
			title: 'Another convention',
			href: '/guidelines/spelling/#other',
			relatedRuleIds: []
		};
		await render(ReferenceIndex, { corpus: [...corpus, other], selectedTopic: 'performers' });
		expect(document.querySelectorAll('.reference-result')).toHaveLength(3);
		setReadingAnchor('other');
		await expect
			.element(page.getByRole('link', { name: /Another convention/ }))
			.toHaveAttribute('aria-current', 'page');
		expect(document.querySelector('.reference-description')).toBeNull();
	});

	it('starts with a compact topic directory and exposes entries only after a choice', async () => {
		await render(ReferenceIndex, { corpus });
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		expect(document.querySelector('.reference-topics a svg[aria-hidden="true"]')).not.toBeNull();
		await expect
			.element(page.getByText('How do I label song sections and credit different singers?'))
			.toBeVisible();
		expect(document.querySelector('.reference-topics .sr-only')).toBeNull();
		expect(document.querySelector('.reference-topics a')?.getAttribute('href')).toBe(
			'/guidelines/section-headers/'
		);
		expect(document.querySelector('[aria-label="Search scope"]')).toBeNull();
		expect(document.querySelector('.reference-topics + button')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Browse topics', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Browse all', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(2);
		await page.getByRole('button', { name: 'Browse topics', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
	});

	it('searches conventions and checks together, groups related checks in compact rows', async () => {
		await render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('two singers');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		expect(document.querySelector('.reference-description')).toBeNull();
		const disclosure = document.querySelector<HTMLDetailsElement>('.reference-related')!;
		expect(disclosure.open).toBe(false);
		await page.getByText('Related checks (1)', { exact: true }).click();
		expect(disclosure.open).toBe(true);
		expect(disclosure.querySelectorAll('li > a')).toHaveLength(1);
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

	it('expands checks below a stable entry and stacks long links at desktop and phone widths', async () => {
		const second = {
			...corpus[1]!,
			id: 'second',
			title: 'A second check with a long title that must stay readable at a narrow phone width',
			href: '/guidelines/checks/second/'
		};
		const entries = [
			{ ...corpus[0]!, relatedRuleIds: ['performers.legend', 'second'] },
			corpus[1]!,
			second
		];
		for (const width of [1200, 390]) {
			await page.viewport(width, 844);
			setReadingAnchor('voices');
			const view = await render(ReferenceIndex, { corpus: entries, selectedTopic: 'performers' });
			try {
				const entry = document.querySelector<HTMLElement>('.reference-entry')!;
				const title = entry.querySelector<HTMLElement>('.reference-result')!;
				const disclosure = entry.querySelector<HTMLDetailsElement>('details')!;
				const summary = disclosure.querySelector('summary')!;
				const before = [title.getBoundingClientRect().y, summary.getBoundingClientRect().y];
				await page.getByText('Related checks (2)', { exact: true }).click();
				expect(disclosure.open).toBe(true);
				expect([title.getBoundingClientRect().y, summary.getBoundingClientRect().y]).toEqual(
					before
				);
				const links = [...disclosure.querySelectorAll('li > a')];
				expect(links).toHaveLength(2);
				expect(links[1]!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
					links[0]!.getBoundingClientRect().bottom
				);
				expect(entry.scrollWidth).toBeLessThanOrEqual(entry.clientWidth);
				expect(entry.dataset.current).toBe('page');
				expect(getComputedStyle(entry).borderInlineStartStyle).toBe('solid');
				await page.getByText('Related checks (2)', { exact: true }).click();
				expect(disclosure.open).toBe(false);
			} finally {
				await view.unmount();
				await page.viewport(800, 600);
			}
		}
	});

	it('finds matching lookup text and preserves lookup state in result links', async () => {
		await render(ReferenceIndex, { corpus });
		await page.getByRole('searchbox').fill('definately');
		expect(document.querySelector('.reference-result')?.textContent).toContain(
			'A common spelling error'
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
		await page.getByRole('button', { name: 'Clear filters' }).click();
		expect(referenceSearchState().query).toBe('');
	});

	it('marks the reading position without changing an active search', async () => {
		setReferenceSearchState({ query: 'two singers' });
		setReadingAnchor('voices');
		await render(ReferenceIndex, { corpus, selectedTopic: 'performers' });
		await expect
			.element(page.getByRole('link', { name: /Credit each singer/ }))
			.toHaveAttribute('aria-current', 'page');
		expect(referenceSearchState().query).toBe('two singers');
		expect(document.querySelector('button.reference-ask')).toBeNull();
	});
	it('narrows linter checks by severity and fix type without changing the query', async () => {
		setReferenceSearchState({ scope: 'rules', browseAll: true });
		await render(ReferenceIndex, { corpus });
		await page.getByText('Filters (active)', { exact: true }).click();
		await page.getByRole('button', { name: 'Warnings', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(1);
		expect(document.querySelector('.reference-result')?.textContent).toContain(
			'A voice with no legend'
		);
		await page.getByRole('button', { name: 'Automatic fix', exact: true }).click();
		expect(document.querySelectorAll('.reference-result')).toHaveLength(0);
		expect(referenceSearchState().query).toBe('');
		const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
		expect(document.querySelector('.reference-filters')?.textContent).not.toContain(
			'Clear filters'
		);
		expect(
			[...document.querySelectorAll('.reference-results-header button')].map((button) =>
				button.textContent?.trim()
			)
		).toEqual(['Clear filters']);

		await clear.click();
		expect(referenceSearchState().scope).toBe('all');
		expect(referenceSearchState().severities).toEqual([]);
		expect(referenceSearchState().fixabilities).toEqual([]);
		await expect.element(clear).not.toBeInTheDocument();
	});

	it('reveals a deep-linked rule alongside all topics', async () => {
		await render(ReferenceIndex, { corpus, selectedSlug: 'performers-legend' });
		expect(document.querySelector('a[aria-current="page"]')?.textContent).toContain(
			'A voice with no legend'
		);
		expect(referenceSearchState().topic).toBe('');
		expect(document.querySelectorAll('.reference-result')).toHaveLength(2);
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
			corpusHash: 'a'.repeat(64),
			ask: async () => {
				throw new Error('Opening must not send a question');
			}
		});
		await render(ReferenceIndex, { corpus, assistant });
		const ask = document.querySelector<HTMLButtonElement>('.reference-ask')!;
		const filters = document.querySelector<HTMLElement>('.reference-filters')!;
		expect(ask.closest('search')?.nextElementSibling).toBe(filters);
		expect(filters.nextElementSibling?.querySelector('h2')?.textContent).toBe('Browse by topic');
		expect(ask.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		const toggle = page.getByRole('button', { name: 'Filters', exact: true });
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
		const before = ask.getBoundingClientRect().y;
		await page.getByText('Filters', { exact: true }).click();
		expect(filters.hidden).toBe(false);
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
		expect(ask.getBoundingClientRect().y).toBe(before);
		await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
		expect(assistant.isOpen).toBe(true);
	});
	it.each([1200, 390])(
		'keeps finder controls aligned while filters expand at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			const view = await render(ReferenceIndex, { corpus });
			try {
				const search = document.querySelector<HTMLElement>('.site-finder__search')!;
				const toggle = document.querySelector<HTMLButtonElement>(
					'[aria-controls="reference-filters"]'
				)!;
				const before = [search.getBoundingClientRect().y, toggle.getBoundingClientRect().y];
				await page.getByRole('button', { name: 'Filters', exact: true }).click();
				expect([search.getBoundingClientRect().y, toggle.getBoundingClientRect().y]).toEqual(
					before
				);
				expect(toggle.getAttribute('aria-expanded')).toBe('true');
				for (const field of document.querySelectorAll('.reference-filters select')) {
					expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
						search.getBoundingClientRect().right
					);
				}
				expect(document.querySelector('.reference-browse-actions')).toBeNull();
				expect(document.querySelectorAll('.reference-results-header button')).toHaveLength(1);
				await page.getByRole('button', { name: 'Filters', exact: true }).click();
				expect(document.querySelector<HTMLElement>('.reference-filters')!.hidden).toBe(true);
			} finally {
				await view.unmount();
				await page.viewport(800, 600);
			}
		}
	);

	it('marks useful search words without highlighting question stopwords', async () => {
		await render(ReferenceIndex, { corpus });
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
		await render(ReferenceIndex, { corpus });
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
