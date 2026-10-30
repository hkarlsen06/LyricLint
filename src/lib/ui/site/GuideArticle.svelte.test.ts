import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick, type ComponentProps } from 'svelte';
import { guidanceTopics } from '#lib/guidance/entries.js';
import { resetReferenceSearchState, setReferenceSearchState } from './reference-search.svelte.js';
import GuideArticle from './GuideArticle.svelte';

const data = {
	sections: guidanceTopics().map(({ topic }) => ({ topic, checksById: {}, additionalChecks: [] })),
	spellings: undefined,
	referenceCorpus: [],
	guidanceCount: 0,
	guidanceTopics: guidanceTopics().map(({ topic }) => topic)
} satisfies ComponentProps<typeof GuideArticle>['data'];

afterEach(() => resetReferenceSearchState());

describe('bounded guide reading', () => {
	it('renders one topic with one h1 and stable convention fragments', async () => {
		const view = await render(GuideArticle, { data, topic: 'ad-libs' });
		expect(view.container.querySelectorAll('h1')).toHaveLength(1);
		expect(view.container.querySelector('#include-every')?.tagName).toBe('H2');
		expect(view.container.querySelector('#bracketed-headers')).toBeNull();
		expect(view.container.querySelector('.guide-glass, .guide-topic-pin')).toBeNull();
	});
	it('keeps the same article entries and order when search changes', async () => {
		const view = await render(GuideArticle, { data, topic: 'ad-libs' });
		const headings = () =>
			[...view.container.querySelectorAll('.guidelines__entry h2')].map((heading) => heading.id);
		const before = headings();
		setReferenceSearchState({ query: 'a phrase absent from this topic' });
		await tick();
		expect(headings()).toEqual(before);
		expect(view.container.textContent).toContain('Transcribe every ad-lib');
	});
	it('renders the complete guide only when no topic is passed', async () => {
		const view = await render(GuideArticle, { data });
		expect(view.container.querySelector('#topic-ad-libs')?.tagName).toBe('H2');
		expect(view.container.querySelector('#include-every')?.tagName).toBe('H3');
		expect(view.container.querySelector('#bracketed-headers')).not.toBeNull();
		expect(view.container.querySelector('#unknown-marker')).not.toBeNull();
	});
});
