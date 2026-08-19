import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { appleStore, spotifyStore } from '../state/media-test-stores.js';
import MediaArtwork from './MediaArtwork.svelte';

const cover = 'https://is1-ssl.mzstatic.com/image/thumb/x/640x640bb.jpg';
/** Apple's `artwork.url` is a template; the source resolves the two sizes in it. */
const coverTemplate = 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.jpg';

/** This band's song always has a cover, except where a test says otherwise. */
const withCover = () => appleStore({ artwork: coverTemplate });

describe('MediaArtwork', () => {
	/*
	 * The compact row is the only shape: thumbnail, title over artist, and the
	 * mark at the far end. The stage this band used to expand into — and the fold
	 * that remembered it — are gone, so nothing here may draw a second transport
	 * or a chevron.
	 */
	it('draws one compact row: thumbnail, title over artist, and the mark', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const row = document.querySelector('.media-artwork') as HTMLElement;
		expect(row.querySelector('.media-artwork__cover')?.getAttribute('src')).toBe(cover);

		const meta = row.querySelector('.media-artwork__meta') as HTMLElement;
		expect(meta.querySelector('.media-artwork__title')?.textContent).toBe('Stole the Show');
		expect(meta.querySelector('.media-artwork__artist')?.textContent).toBe('Kygo');

		// Title over artist: the song is what the row is about.
		const title = meta.querySelector('.media-artwork__title')!.getBoundingClientRect();
		const artist = meta.querySelector('.media-artwork__artist')!.getBoundingClientRect();
		expect(title.top).toBeLessThan(artist.top);

		// Thumbnail at the head, facts beside it, mark at the far end.
		const thumb = row.querySelector('.media-artwork__thumb')!.getBoundingClientRect();
		const aside = row.querySelector('.media-artwork__aside') as HTMLElement;
		expect(thumb.right).toBeLessThanOrEqual(meta.getBoundingClientRect().left);
		expect(aside.getBoundingClientRect().left).toBeGreaterThan(meta.getBoundingClientRect().right);
		expect(aside.querySelector('.media-attribution__apple')).not.toBeNull();

		// No second transport and no fold: the row is a row.
		expect(document.querySelector('.media-artwork__controls')).toBeNull();
		expect(document.querySelector('.media-artwork__toggle')).toBeNull();

		// Bigger than caption type: these two lines are the row.
		expect(parseFloat(getComputedStyle(meta).fontSize)).toBeGreaterThan(12);
	});

	/*
	 * A song with no cover is still a song, and this band is the only surface that
	 * names one: the strip hands both the title and the mark over here on the
	 * source kind (`drawsCoverBand`). Gated on the picture, a catalogue read that
	 * answers 404 or 403 — which reports no artwork ever, not merely late — left
	 * the workbench playing somebody's track and saying nothing about it, with
	 * neither required attribution drawn.
	 */
	it('names the song and draws the mark before — or without — a cover', async () => {
		const { media, player } = await appleStore();
		expect(player.artwork).toBeUndefined();

		const { container } = render(MediaArtwork, { props: { media } });

		expect(container.querySelector('.media-artwork')).not.toBeNull();
		const meta = document.querySelector('.media-artwork__meta') as HTMLElement;
		expect(meta.querySelector('.media-artwork__title')?.textContent).toBe('Stole the Show');
		expect(meta.querySelector('.media-artwork__artist')?.textContent).toBe('Kygo');
		expect(document.querySelector('.media-attribution__apple')).not.toBeNull();

		// No picture, so no press that would open one and no dialog to open.
		expect(document.querySelector('.media-artwork__thumb')).toBeNull();
		expect(document.querySelector('.artwork-dialog')).toBeNull();
	});

	// The same, one source over: Spotify's read carries the cover with the name,
	// so a refused one costs both — and their mark is required wherever the track
	// is playing.
	it('names a Spotify track with no cover and keeps their mark on screen', async () => {
		const { media, player } = await spotifyStore();
		expect(player.artwork).toBeUndefined();

		render(MediaArtwork, { props: { media } });

		expect(document.querySelector('.media-artwork__title')?.textContent).toBe('Sensommer');
		expect(document.querySelector('.media-artwork__artist')?.textContent).toBe('Mul');
		expect(document.querySelector('.media-attribution__spotify')).not.toBeNull();
	});

	// And when the picture does land, the row it lands into is the one already
	// standing: the thumbnail appears at its head rather than the band changing
	// shape.
	it('grows the thumbnail in place when the cover arrives', async () => {
		const { media } = await appleStore();
		const { rerender } = render(MediaArtwork, { props: { media } });
		expect(document.querySelector('.media-artwork__thumb')).toBeNull();

		const withArtwork = await withCover();
		await rerender({ media: withArtwork.media });

		expect(document.querySelector('.media-artwork__thumb')).not.toBeNull();
		expect(document.querySelector('.media-artwork__cover')?.getAttribute('src')).toBe(cover);
	});

	/*
	 * Looking at the picture bigger is a press on the picture: the thumbnail is a
	 * button and the full-size cover opens in a modal, which also carries the two
	 * artwork commands the Song panel offers — the same `ArtworkActions`
	 * component, so the pair cannot drift between the two surfaces.
	 */
	it('opens the full-size cover in a modal with the two artwork commands', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		const dialog = document.querySelector('.artwork-dialog') as HTMLDialogElement;
		expect(dialog.open).toBe(false);

		await page.getByRole('button', { name: 'View album art' }).click();
		expect(dialog.open).toBe(true);

		// The big picture is the same cover, and the header names the track.
		expect(dialog.querySelector('.artwork-dialog__cover')?.getAttribute('src')).toBe(cover);
		expect(dialog.querySelector('#artwork-dialog-title')?.textContent).toBe('Stole the Show');

		// Both commands ride the dialog, in the shared actions row.
		const actions = dialog.querySelector('.artwork-actions') as HTMLElement;
		expect(actions).not.toBeNull();
		await expect.element(page.getByRole('button', { name: 'Copy image URL' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Download album art' })).toBeVisible();

		// Its own closing control shuts it again.
		await page.getByRole('button', { name: 'Close' }).click();
		expect(dialog.open).toBe(false);
	});

	// The copy is the resolved address the panel would download, and the
	// confirmation reaches both audiences: the label swaps for the eye and the
	// announcement carries it for a screen reader.
	it('copies the cover’s address from the modal and announces it', async () => {
		const copied: string[] = [];
		const clipboard = { writeText: async (text: string) => void copied.push(text) };
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as unknown as Clipboard);

		const announced: string[] = [];
		const { media } = await withCover();
		render(MediaArtwork, {
			props: { media, announce: (message: string) => announced.push(message) }
		});

		await page.getByRole('button', { name: 'View album art' }).click();
		await page.getByRole('button', { name: 'Copy image URL' }).click();

		await vi.waitFor(() => expect(copied).toEqual([cover]));
		await expect.element(page.getByRole('button', { name: 'Image URL copied' })).toBeVisible();
		expect(announced).toEqual(['Image URL copied.']);
	});

	// A cover carries nothing a screen reader can use: the track is named in the
	// row beside the thumbnail and in the dialog's own header, and the press
	// carries its name on the button — so an alt on either image would announce
	// the same fact twice.
	it('leaves both copies of the cover out of the accessible tree', async () => {
		const { media } = await withCover();
		render(MediaArtwork, { props: { media } });

		expect(document.querySelector('.media-artwork__cover')?.getAttribute('alt')).toBe('');
		expect(document.querySelector('.artwork-dialog__cover')?.getAttribute('alt')).toBe('');
	});
});
