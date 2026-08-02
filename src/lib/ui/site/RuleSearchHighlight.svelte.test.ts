import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RuleSearchHighlight from './RuleSearchHighlight.svelte';
import { setRuleSearchQuery } from './rule-search.svelte.js';

// The query is module state — it has to be, because the rule the reader opens
// and the list they opened it from are sibling columns with nothing to hand
// each other — so it survives a render the way it survives a navigation. Every
// test here starts from a field nobody has typed in.
beforeEach(() => setRuleSearchQuery(''));

/**
 * The component renders text and `<mark>`s and no wrapper of its own — that is
 * the whole point of it, since it has to stand inside a heading, a `<pre>` and
 * a run of code segments alike — so the render container is the only box that
 * holds exactly what it drew and nothing the harness put in the page. Read as
 * text, which is what makes the whitespace assertions below mean anything.
 */
let container: HTMLElement;

function drawn(): string {
	return container.textContent ?? '';
}

/** What the reader would see marked, in order. */
function marks(): string[] {
	return [...container.querySelectorAll('mark')].map((mark) => mark.textContent ?? '');
}

function draw(text: string) {
	const result = render(RuleSearchHighlight, { text });
	container = result.container;
	return result;
}

describe('RuleSearchHighlight', () => {
	it('draws the text unchanged while nothing has been searched for', () => {
		draw('Use [Verse 1] rather than Verse 1:');

		expect(drawn()).toBe('Use [Verse 1] rather than Verse 1:');
		expect(marks()).toEqual([]);
	});

	it('marks the query where it appears', () => {
		setRuleSearchQuery('verse');
		draw('Use [Verse 1] rather than Verse 1:');

		expect(marks()).toEqual(['Verse', 'Verse']);
		// The mark is a `<mark>` rather than a coloured span, so the fact is in
		// the accessible tree and not carried by colour alone.
		expect(container.querySelector('mark')?.className).toBe('rules__hit');
	});

	it('adds not one character to the text it marks', () => {
		// This is the assertion the whole component is written around. The
		// examples on a rule page are set in a `<pre>`, so a newline the template
		// introduced between two segments is a line of a transcription nobody
		// typed — and a formatter is what will introduce it. Nothing else here
		// would catch it, because it looks exactly like working markup.
		const lyric = '[Verse 1]\nI heard you say\n  it twice  ';
		setRuleSearchQuery('verse say');
		draw(lyric);

		expect(drawn()).toBe(lyric);
		expect(marks()).toEqual(['Verse', 'say']);
	});

	it('marks whole characters where the fold changed the string’s length', () => {
		setRuleSearchQuery('ca va');
		draw('Ça va bien');

		expect(marks()).toEqual(['Ça', 'va']);
		expect(drawn()).toBe('Ça va bien');
	});

	it('follows the query as it is typed, because the field is beside the page', async () => {
		setRuleSearchQuery('head');
		draw('Use song part headers');
		expect(marks()).toEqual(['head']);

		// Two words are two terms, both of which had to match for the rule to be
		// listed, so both are marked — and the space between them is part of
		// neither, which is why this is two marks rather than one.
		setRuleSearchQuery('song part');
		await tick();
		expect(marks()).toEqual(['song', 'part']);

		setRuleSearchQuery('');
		await tick();
		expect(marks()).toEqual([]);
		expect(drawn()).toBe('Use song part headers');
	});
});
