import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SongFacts, { creditSegments } from './SongFacts.svelte';

/*
 * The list exists to be retyped into another page's fields, and Genius takes one
 * writer at a time — so every value here is a press, and a writers row is one
 * press per name. What the tests below defend is the line staying exactly the
 * string the catalogue gave us while that happens.
 */

const KATASTROFE = {
	artist: 'Katastrofe',
	title: 'Går det bra?',
	releaseDate: '2025-06-11',
	writers:
		'Petter Bjørklund Kristiansen, Kristofer Strandberg, Thor-Erik Claussen & Andreas Werling',
	album: 'Går det bra? - Single',
	label: 'RCA Records Label'
};

/** The clipboard is the only thing these presses touch. */
function stubClipboard(): { copied: string[]; refuse: () => void } {
	let refusing = false;
	const copied: string[] = [];
	const clipboard = {
		writeText: async (text: string) => {
			if (refusing) throw new Error('denied');
			copied.push(text);
		}
	};
	vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as unknown as Clipboard);
	return {
		copied,
		refuse: () => {
			refusing = true;
		}
	};
}

describe('creditSegments', () => {
	/*
	 * The whole safety argument for cutting a credit up at all. `SongDetails.writers`
	 * is passed through unsplit because a name this application has rewritten is
	 * worse than the one it was given — so this may only move where a press lands,
	 * never what the row says.
	 */
	it('joins back to the string it was given', () => {
		for (const credit of [
			KATASTROFE.writers,
			'Kygo, Parker Ighile',
			'Lennon/McCartney',
			'Solo Writer',
			'Smith, Jr.',
			''
		]) {
			expect(creditSegments(credit).join('')).toBe(credit);
		}
	});

	it('offers each name in the credit as its own segment', () => {
		expect(creditSegments('Kygo, Parker Ighile').filter((_, index) => index % 2 === 0)).toEqual([
			'Kygo',
			'Parker Ighile'
		]);
	});
});

describe('SongFacts', () => {
	it('copies one writer at a time, and the rest of a value whole', async () => {
		const { copied } = stubClipboard();
		render(SongFacts, { props: { details: KATASTROFE, genius: true } });

		await page.getByRole('button', { name: 'Copy Thor-Erik Claussen' }).click();
		await page.getByRole('button', { name: 'Copy RCA Records Label' }).click();
		// A separator is not a press: the punctuation between two names belongs to
		// neither of them.
		expect(copied).toEqual(['Thor-Erik Claussen', 'RCA Records Label']);
	});

	/*
	 * Measured rather than trusted, because the failure looks exactly like working
	 * markup: a name and its own comma separated by a space — `Kristiansen ,
	 * Kristofer` — is what this line becomes the moment anything gets between the
	 * pieces. A `gap` on the row would do it, as would a piece moved out of the
	 * block whose edges the compiler trims. The spacing here is the credit string's
	 * own punctuation and nothing else.
	 */
	it('draws the credit line with the string’s own separators and no others', async () => {
		const { container } = render(SongFacts, { props: { details: KATASTROFE, genius: true } });

		const writers = [...container.querySelectorAll('dd')].find((value) =>
			value.textContent?.includes('Kristofer Strandberg')
		) as HTMLElement;
		const pieces = [...writers.querySelectorAll('.metadata-copy, .metadata-copy__separator')];
		expect(pieces.map((piece) => piece.textContent?.trim()).join('|')).toBe(
			'Petter Bjørklund Kristiansen|,|Kristofer Strandberg|,|Thor-Erik Claussen|&|Andreas Werling'
		);

		// Each piece begins where the one before it ended, on the rows they share.
		for (const [index, piece] of pieces.slice(1).entries()) {
			const before = pieces[index].getBoundingClientRect();
			const here = piece.getBoundingClientRect();
			if (here.top !== before.top) continue;
			expect(Math.abs(here.left - before.right)).toBeLessThan(0.5);
		}
	});

	/*
	 * The confirmation is the copied name and nothing beside it, so nothing on the
	 * line can move: a mark appended on the press would shift the row the pointer is
	 * still resting on, and reserving a slot for one would indent every row for a
	 * state showing on none of them.
	 */
	it('confirms a copy in the name it took, without moving anything', async () => {
		stubClipboard();
		render(SongFacts, { props: { details: KATASTROFE, genius: true } });

		const first = page.getByRole('button', { name: 'Copy Petter Bjørklund Kristiansen' }).element();
		const second = page.getByRole('button', { name: 'Copy Kristofer Strandberg' }).element();
		const resting = getComputedStyle(second).color;
		const before = second.getBoundingClientRect();

		expect(getComputedStyle(first).color).toBe(resting);
		await page.getByRole('button', { name: 'Copy Petter Bjørklund Kristiansen' }).click();

		// One name changes, and it is the one that was taken.
		await vi.waitFor(() => expect(getComputedStyle(first).color).not.toBe(resting));
		expect(getComputedStyle(second).color).toBe(resting);
		const after = second.getBoundingClientRect();
		expect(after.left).toBe(before.left);
		expect(after.top).toBe(before.top);
	});

	// A row claiming a copy that never landed is worse than no answer at all — the
	// same silence the toolbar's own button keeps when the clipboard refuses.
	it('says nothing when the clipboard refuses', async () => {
		const { refuse } = stubClipboard();
		refuse();
		const { container } = render(SongFacts, { props: { details: KATASTROFE, genius: true } });

		const label = page.getByRole('button', { name: 'Copy RCA Records Label' }).element();
		const resting = getComputedStyle(label).color;
		await page.getByRole('button', { name: 'Copy RCA Records Label' }).click();

		expect(getComputedStyle(label).color).toBe(resting);
		expect(container.querySelector('.is-copied')).toBeNull();
	});

	// The date keeps its machine-readable form, and the press is still the value.
	it('keeps the release date a <time>', async () => {
		const { copied } = stubClipboard();
		const { container } = render(SongFacts, { props: { details: KATASTROFE, genius: true } });

		expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2025-06-11');
		await page.getByRole('button', { name: 'Copy 2025-06-11' }).click();
		expect(copied).toEqual(['2025-06-11']);
	});
});
