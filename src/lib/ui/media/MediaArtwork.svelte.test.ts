import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { appleStore } from '../state/media-test-stores.js';
import MediaArtwork from './MediaArtwork.svelte';

const cover = 'https://is1-ssl.mzstatic.com/image/thumb/x/640x640bb.jpg';
/** Apple's `artwork.url` is a template; the source resolves the two sizes in it. */
const coverTemplate = 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.jpg';

/** This band's song always has a cover, except where a test says otherwise. */
const withCover = () => appleStore({ artwork: coverTemplate });

describe('MediaArtwork', () => {
	/*
	 * The picture is the surface, so every fact is on it — and the two ends are
	 * rows rather than four corners, because corners collide the moment an artist
	 * and a title are both long.
	 */
	it('sets the artist and the title at the two ends of the picture’s top row', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const top = document.querySelector('.media-artwork__top') as HTMLElement;
		expect(top.querySelector('.media-artwork__artist')?.textContent).toBe('Kygo');
		expect(top.querySelector('.media-artwork__title')?.textContent).toBe('Stole the Show');

		const artist = top.querySelector('.media-artwork__artist')!.getBoundingClientRect();
		const title = top.querySelector('.media-artwork__title')!.getBoundingClientRect();
		expect(artist.left).toBeLessThan(title.left);
		expect(document.querySelector('.media-artwork__cover')?.getAttribute('src')).toBe(cover);
	});

	/*
	 * The other end, and the halves are the other way round: what is operated sits
	 * under the hand at the left, and the mark that only has to be seen sits at the
	 * right. Both are measured rather than trusted, because a flex row that has
	 * lost its `space-between` still renders both elements.
	 */
	it('puts the transport bottom left and the mark bottom right', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const bottom = document.querySelector('.media-artwork__bottom') as HTMLElement;
		const controls = bottom.querySelector('.media-artwork__controls')!.getBoundingClientRect();
		const mark = bottom.querySelector('.media-attribution__apple')!.getBoundingClientRect();
		expect(controls.left).toBeLessThan(mark.left);

		const stage = document.querySelector('.media-artwork__stage')!.getBoundingClientRect();
		expect(bottom.getBoundingClientRect().bottom).toBeCloseTo(stage.bottom, 0);
	});

	/*
	 * The contrast, and it is not decoration: what these read against is somebody
	 * else's album art, half the covers in the world are pale, and white alone
	 * vanishes on a third of them. Both ends are scrimmed because both ends now
	 * carry something.
	 */
	it('scrims both ends of the picture, in opposite directions', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const top = getComputedStyle(document.querySelector('.media-artwork__top')!);
		const bottom = getComputedStyle(document.querySelector('.media-artwork__bottom')!);
		expect(top.backgroundImage).toContain('gradient');
		expect(bottom.backgroundImage).toContain('gradient');
		expect(top.backgroundImage).not.toBe(bottom.backgroundImage);
		expect(top.color).toBe(bottom.color);
	});

	/*
	 * Folded: the picture scales down to the left and the facts stand beside it,
	 * with the mark under them and no transport — the controls under the document
	 * are the ones in use while typing, and a second copy of them beside a
	 * thumbnail is a row of buttons for a picture nobody is looking at.
	 */
	it('scales the picture down to the left and stands the facts beside it', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media, open: false } });

		const stage = document.querySelector('.media-artwork__stage')!.getBoundingClientRect();
		const meta = document.querySelector('.media-artwork__meta')!.getBoundingClientRect();
		expect(stage.width).toBeGreaterThan(0);
		expect(stage.right).toBeLessThanOrEqual(meta.left);

		const folded = document.querySelector('.media-artwork__meta') as HTMLElement;
		expect(folded.querySelector('.media-artwork__artist')?.textContent).toBe('Kygo');
		expect(folded.querySelector('.media-artwork__title')?.textContent).toBe('Stole the Show');

		// Title over artist here, which is the opposite of the order they take on
		// the picture: there they are the two ends of one line.
		const foldedTitle = folded.querySelector('.media-artwork__title')!.getBoundingClientRect();
		const foldedArtist = folded.querySelector('.media-artwork__artist')!.getBoundingClientRect();
		expect(foldedTitle.top).toBeLessThan(foldedArtist.top);

		// The way back over the mark, both at the far end, and no transport at all.
		const aside = document.querySelector('.media-artwork__aside') as HTMLElement;
		const chevron = aside.querySelector('.media-artwork__toggle')!.getBoundingClientRect();
		const mark = aside.querySelector('.media-attribution__apple')!.getBoundingClientRect();
		expect(chevron.top).toBeLessThan(mark.top);
		expect(aside.getBoundingClientRect().left).toBeGreaterThan(meta.right);
		expect(document.querySelector('.media-artwork__controls')).toBeNull();
		await expect.element(page.getByRole('button', { name: 'Show artwork' })).toBeVisible();

		// Bigger than the overlay's caption type: these two lines are the row.
		expect(parseFloat(getComputedStyle(folded).fontSize)).toBeGreaterThan(12);
	});

	/*
	 * The same element in both states, which is what makes the fold a scale rather
	 * than a swap. Two `<img>`s would cross-fade at best and re-request at worst.
	 */
	it('folds the picture it already has rather than swapping in another', async () => {
		const { media } = await withCover();
		const { rerender } = render(MediaArtwork, { props: { media, open: true } });

		const opened = document.querySelector('.media-artwork__cover');
		const wide = opened!.getBoundingClientRect().width;

		await rerender({ media, open: false });

		expect(document.querySelector('.media-artwork__cover')).toBe(opened);
		// Polled rather than read once: the width is a transition, so the frame the
		// rerender returns on is still the old one — which is the whole point.
		await vi.waitFor(() => expect(opened!.getBoundingClientRect().width).toBeLessThan(wide));
	});

	/*
	 * Before the cover lands, nothing draws at all.
	 *
	 * The version this replaces stood the row up at attach time with the
	 * thumbnail's slot empty, so a layout would already be standing when the
	 * picture arrived. What that produced was a tall band of chrome holding two
	 * lines and a badge — the emptiest thing in the panel, for exactly as long as
	 * the catalogue read takes. The strip says nothing either, so the song is
	 * silent on screen until there is something to show.
	 */
	it('draws nothing at all until the cover arrives', async () => {
		const { media, player } = await appleStore();
		expect(player.artwork).toBeUndefined();

		const { container } = render(MediaArtwork, { props: { media } });

		expect(container.querySelector('.media-artwork')).toBeNull();
		expect(document.querySelector('.media-artwork__meta')).toBeNull();
		expect(document.querySelector('.media-attribution__apple')).toBeNull();
	});

	/*
	 * Expanded, the picture is in nothing: no inset, no rounded corner, the full
	 * width of the band. Measured against the band rather than trusted to the
	 * rule, because a stray padding anywhere in the chain reads as working CSS.
	 */
	it('lets the picture fill the band edge to edge when it is open', async () => {
		const { media } = await withCover();
		const { container } = render(MediaArtwork, { props: { media, open: true } });

		const band = container.querySelector('.media-artwork')!.getBoundingClientRect();
		const stage = document.querySelector('.media-artwork__stage')!.getBoundingClientRect();
		expect(stage.left).toBe(band.left);
		expect(stage.width).toBe(band.width);
		expect(getComputedStyle(document.querySelector('.media-artwork__stage')!).borderRadius).toBe(
			'0px'
		);
	});

	/**
	 * The fold is reported, not owned.
	 *
	 * Two things would forget it otherwise: this band is destroyed whenever the
	 * attached source changes, so a local flag resets on every swapped song, and a
	 * reload starts over. The controller holds it and writes it beside the current
	 * draft, which is also what puts it inside the workspace backup and inside
	 * `Delete all local data`.
	 */
	it('draws what it is told and reports the press rather than acting on it', async () => {
		const { media } = await withCover();
		const toggles: boolean[] = [];
		render(MediaArtwork, {
			props: { media, open: true, onToggle: (open: boolean) => toggles.push(open) }
		});

		expect(document.querySelector('.media-artwork__top')).not.toBeNull();
		await page.getByRole('button', { name: 'Hide artwork' }).click();

		expect(toggles).toEqual([false]);
		// Nothing moved on its own: the band is still open until it is told.
		expect(document.querySelector('.media-artwork__top')).not.toBeNull();
	});

	/**
	 * The transport is on the picture, not in the bar, and it is the strip's own.
	 *
	 * Two copies of three buttons would be two copies of every label rule — and
	 * `Previous line` appearing on one surface while the other still said
	 * `Back 2 seconds` is the kind of drift nobody notices for months.
	 *
	 * They are now identical, which they were not: the strip used to print the
	 * keystroke under each glyph and this surface deliberately did not. Both
	 * name themselves through the shared tooltip instead, so there is no caption
	 * left to differ about — and no `captions` prop, whose only reader this was.
	 */
	it('puts the transport over the cover, with no caption under any glyph', async () => {
		const { media, player } = await withCover();
		player.setCuePoints([12, 30]);
		render(MediaArtwork, { props: { media } });

		const controls = document.querySelector('.media-artwork__controls');
		expect(controls?.contains(page.getByRole('button', { name: 'Play' }).element())).toBe(true);
		// The same labels the strip uses, from the same component.
		await expect.element(page.getByRole('button', { name: 'Previous line' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Next line' })).toBeVisible();
		expect(controls?.querySelectorAll('kbd')).toHaveLength(0);
	});

	// Play leads, the way it does in every transport anyone has used — and all
	// three are player-sized rather than chrome-sized, which is the whole reason
	// they are on the picture rather than in the bar.
	it('draws the controls at player size, with play the largest', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const glyph = (name: string) =>
			page.getByRole('button', { name }).element().querySelector('svg')!.getBoundingClientRect()
				.width;

		expect(glyph('Play')).toBeGreaterThan(glyph('Back 2 seconds'));
		expect(glyph('Back 2 seconds')).toBeGreaterThan(14);
	});

	// A cover carries nothing a screen reader can use, and the track is named on
	// the row directly above it — so an alt here would announce the same fact
	// twice rather than add one.
	it('leaves the cover out of the accessible tree', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		expect(document.querySelector('.media-artwork__cover')?.getAttribute('alt')).toBe('');
	});
});
