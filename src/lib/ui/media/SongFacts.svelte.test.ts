import { page, userEvent } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import SongFacts, { creditSegments } from './SongFacts.svelte';
import ToastRegion from '../primitives/ToastRegion.svelte';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createFeedbackState } from '../state/feedback.svelte.js';

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

/** What a run of these presses actually reached, and the way to make one refuse. */
interface StubbedClipboard {
	copied: string[];
	refuse: () => void;
	allow: () => void;
}

/** The clipboard is the only thing these presses touch. */
function stubClipboard(): StubbedClipboard {
	let refusing = false;
	const copied: string[] = [];
	const clipboard: Partial<Clipboard> = {
		writeText: async (text: string) => {
			if (refusing) throw new Error('denied');
			copied.push(text);
		}
	};
	vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as Clipboard);
	return {
		copied,
		refuse: () => {
			refusing = true;
		},
		allow: () => {
			refusing = false;
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

async function mountFacts(details = KATASTROFE) {
	const feedback = createFeedbackState();
	const view = await render(SongFacts, { props: { details, genius: true, feedback } });
	await render(ToastRegion, { feedback });
	await render(LiveRegion, { feedback });
	// Cold font loading changes writer wrapping before any interaction occurs.
	// Measure the real UI face, including the subset used by the supplied names.
	await document.fonts.ready;
	return { ...view, feedback };
}

function positions(elements: Element[]) {
	return elements.map((element) => element.getBoundingClientRect().toJSON());
}

const LONG_WRITER = 'Alexandria Valentina María Konstantinopoulou Bjørklund Kristiansen';
const LONG_DETAILS = { ...KATASTROFE, writers: `${LONG_WRITER}, ${KATASTROFE.writers}` };
const COPY_FAILURE = 'Copy failed. Check browser clipboard permission and try again.';

describe('SongFacts', () => {
	beforeEach(async () => {
		await page.viewport(800, 600);
	});
	it('copies one writer at a time, and the rest of a value whole', async () => {
		const { copied } = stubClipboard();
		await mountFacts();

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
		const { container } = await mountFacts();

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

	it.each([800, 390, 320])(
		'confirms pointer and keyboard copies without shifting long names at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			const { copied } = stubClipboard();
			const { container } = await mountFacts(LONG_DETAILS);
			const first = page.getByRole('button', { name: `Copy ${LONG_WRITER}` });
			const controls = [...container.querySelectorAll('button')];
			const before = positions(controls);
			const live = container.querySelector('[aria-live]')!;

			await first.click();
			await expect.element(first).toHaveClass('is-copied');
			expect(copied).toEqual([LONG_WRITER]);
			expect(live.textContent).toBe(`${LONG_WRITER} copied`);
			const style = getComputedStyle(first.element());
			expect(style.textDecorationLine).toBe('underline');
			expect(style.textDecorationStyle).toBe('double');
			expect(positions(controls)).toEqual(before);
			expect(document.activeElement).toBe(first.element());

			await userEvent.keyboard('{Enter}');
			expect(copied).toEqual([LONG_WRITER, LONG_WRITER]);
			expect(positions(controls)).toEqual(before);
			expect(document.activeElement).toBe(first.element());
			expect(container.querySelectorAll('.is-copied')).toHaveLength(1);
		}
	);

	it.each([800, 390, 320])(
		'shows and announces refusal, clears success, and allows keyboard retry at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			const clipboard = stubClipboard();
			const { container, feedback } = await mountFacts(LONG_DETAILS);
			const first = page.getByRole('button', { name: `Copy ${LONG_WRITER}` });
			const controls = [...container.querySelectorAll('button')];
			const before = positions(controls);
			await first.click();
			await expect.element(first).toHaveClass('is-copied');
			clipboard.refuse();

			await userEvent.keyboard('{Enter}');
			const notification = page.getByRole('region', { name: 'Notifications' });
			await expect.element(notification.getByText(COPY_FAILURE)).toBeVisible();
			await expect.element(page.getByTestId('live-region')).toHaveTextContent(COPY_FAILURE);
			expect(feedback.announcementId).toBe(1);
			expect(container.querySelector('.is-copied')).toBeNull();
			expect(container.querySelector('[aria-live]')?.textContent).toBe('');
			expect(clipboard.copied).toEqual([LONG_WRITER]);
			expect(positions(controls)).toEqual(before);
			expect(document.activeElement).toBe(first.element());

			clipboard.allow();
			await userEvent.keyboard('{Enter}');
			await expect.element(first).toHaveClass('is-copied');
			expect(clipboard.copied).toEqual([LONG_WRITER, LONG_WRITER]);
			expect(container.querySelector('[aria-live]')?.textContent).toBe(`${LONG_WRITER} copied`);
			expect(positions(controls)).toEqual(before);
			expect(document.activeElement).toBe(first.element());
		}
	);

	it('lets only the latest pending copy report its result', async () => {
		const requests = Array.from({ length: 6 }, () => Promise.withResolvers<void>());
		let requestIndex = 0;
		const writeText = vi.fn(() => requests[requestIndex++]!.promise);
		const clipboard: Partial<Clipboard> = { writeText };
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as Clipboard);
		const { container, feedback } = await mountFacts();
		const first = page.getByRole('button', { name: 'Copy Petter Bjørklund Kristiansen' });
		const second = page.getByRole('button', { name: 'Copy Kristofer Strandberg' });
		const live = container.querySelector('[aria-live]')!;

		// A finishing after B starts must not leave success beside B's refusal.
		await first.click();
		await second.click();
		requests[0]!.resolve();
		await requests[0]!.promise;
		await tick();
		expect(container.querySelector('.is-copied')).toBeNull();
		expect(live.textContent).toBe('');
		requests[1]!.reject(new Error('denied'));
		await requests[1]!.promise.catch(() => {});
		await tick();
		await expect
			.element(page.getByRole('region', { name: 'Notifications' }).getByText(COPY_FAILURE))
			.toBeVisible();
		expect(feedback.announcementId).toBe(1);
		expect(container.querySelector('.is-copied')).toBeNull();
		expect(live.textContent).toBe('');

		// Neither a late success nor a late refusal may replace the newer success.
		for (const index of [2, 4]) {
			await first.click();
			await second.click();
			requests[index + 1]!.resolve();
			await requests[index + 1]!.promise;
			await tick();
			await expect.element(second).toHaveClass('is-copied');
			if (index === 2) requests[index]!.resolve();
			else requests[index]!.reject(new Error('late refusal'));
			await requests[index]!.promise.catch(() => {});
			await tick();
			await expect.element(second).toHaveClass('is-copied');
			expect(container.querySelectorAll('.is-copied')).toHaveLength(1);
			expect(live.textContent).toBe('Kristofer Strandberg copied');
			expect(feedback.announcementId).toBe(1);
		}
		expect(writeText).toHaveBeenCalledTimes(6);
	});

	// The date keeps its machine-readable form, and the press is still the value.
	it('keeps the release date a <time>', async () => {
		const { copied } = stubClipboard();
		const { container } = await mountFacts();

		expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2025-06-11');
		await page.getByRole('button', { name: 'Copy 2025-06-11' }).click();
		expect(copied).toEqual(['2025-06-11']);
	});
});
