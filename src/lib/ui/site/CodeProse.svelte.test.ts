import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CodeProse from './CodeProse.svelte';

/**
 * The component draws text and code spans and no wrapper of its own, so the
 * render container is the only box holding exactly what it drew. Read as text,
 * which is what makes the whitespace assertion below mean anything.
 */
function draw(props: { text: string; mark?: ReturnType<typeof marker> }) {
	return render(CodeProse, props).container;
}

function faces(container: HTMLElement): string[] {
	return [...container.querySelectorAll('.site-form')].map((span) => span.textContent ?? '');
}

/**
 * A stand-in for a section's search-marking snippet — the real ones render
 * `SearchHighlight`, whose own marking is pinned beside it. What is under test
 * here is that the snippet reaches every segment, inside the face and out.
 */
function marker() {
	return createRawSnippet((value: () => string) => ({
		render: () => `<mark class="site-hit">${value()}</mark>`
	}));
}

describe('CodeProse', () => {
	it('sets the backticked forms in the code face and nothing else', () => {
		const container = draw({
			text: "the omission — `ballin'`, `gon'` for `gonna` — and a contraction's apostrophe"
		});

		expect(faces(container)).toEqual(["ballin'", "gon'", 'gonna']);
	});

	it('adds not one character to the sentence, and draws no marker', () => {
		// The whole reason the template is one unbroken line: a formatter that
		// breaks it puts a newline between two segments, which in a sentence is a
		// space where the punctuation was — and it looks exactly like working
		// markup. The markers are the other half, since a backtick reaching the
		// reader is the grave accent this face exists to replace.
		const container = draw({ text: 'A time is written in digits: `8 a.m.`, never `8:00 A.M.`' });

		expect(container.textContent).toBe('A time is written in digits: 8 a.m., never 8:00 A.M.');
	});

	it('draws a sentence with no forms in it as plain text', () => {
		const container = draw({ text: 'Every ad-lib belongs in the transcription.' });

		expect(faces(container)).toEqual([]);
		expect(container.textContent).toBe('Every ad-lib belongs in the transcription.');
	});

	it('loses no words to an unpaired marker', () => {
		const container = draw({ text: 'a bare ` and the words after it' });

		expect(container.textContent).toBe('a bare  and the words after it');
	});

	it("draws a box, and never smaller than the ramp's floor", () => {
		// The complaint this answers: the face alone read as small text rather
		// than as quoted text. The fill is what says where a form starts and
		// stops, and the floor is what keeps a form inside an already-small
		// lookup note from dropping under the smallest type on the site — a plain
		// `0.9em` there looks exactly like working CSS.
		const container = draw({ text: 'a multiple of 100 is spelled `a hundred`' });
		const form = container.querySelector('.site-form')!;

		const box = getComputedStyle(form).backgroundColor;
		expect(box).not.toBe('transparent');
		expect(box).not.toBe('rgba(0, 0, 0, 0)');

		container.style.fontSize = '15px';
		expect(getComputedStyle(form).fontSize).toBe('13.5px');
		// The floor, in the register the lookup notes are set in.
		container.style.fontSize = '12px';
		expect(getComputedStyle(form).fontSize).toBe('12px');
	});

	it('marks the query inside the face as well as outside it', () => {
		// A form is the word most likely to have been searched for, so a face that
		// swallowed the marking would lose the highlight on the one word the query
		// was about — which is the whole reason this takes a snippet rather than
		// drawing the segments itself.
		const container = draw({ text: "the omission — `gon'` for `gonna`", mark: marker() });

		expect([...container.querySelectorAll('mark')].map((hit) => hit.textContent)).toEqual([
			'the omission — ',
			"gon'",
			' for ',
			'gonna'
		]);
		expect(container.querySelector('.site-form mark')?.textContent).toBe("gon'");
	});
});
