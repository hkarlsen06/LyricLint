import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage } from './clipboard.js';

/*
 * The one thing worth pinning here is the fallback, because the failure it
 * covers is invisible in development: a cover that draws perfectly in the panel
 * can still refuse the fetch this needs, since an `<img>` asks for no CORS
 * header and a `fetch` does. Without the fallback that is a button that does
 * nothing at all, and it would only be found on somebody else's CDN.
 */
describe('downloadImage', () => {
	afterEach(() => vi.restoreAllMocks());

	it('names the file itself, which is why the bytes come through fetch', async () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);

		await downloadImage(
			'https://cdn.example/cover.jpg',
			'Mul — Sensommer.jpg',
			async () => new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 })
		);

		const anchor = click.mock.instances[0] as HTMLAnchorElement;
		expect(anchor.download).toBe('Mul — Sensommer.jpg');
		expect(anchor.href).toBe('blob:cover');
		expect(open).not.toHaveBeenCalled();
	});

	it.each([
		['a host that refuses the fetch', async () => Promise.reject(new Error('CORS'))],
		['a picture that is no longer there', async () => new Response(null, { status: 404 })]
	])('opens the picture in a tab for %s', async (_case, request) => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);

		await downloadImage('https://cdn.example/cover.jpg', 'cover.jpg', request as typeof fetch);

		expect(click).not.toHaveBeenCalled();
		expect(open).toHaveBeenCalledWith('https://cdn.example/cover.jpg', '_blank', 'noopener');
	});
});
