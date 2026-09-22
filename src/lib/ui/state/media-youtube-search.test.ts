import { describe, expect, it, vi } from 'vitest';
import { searchYouTubeVideos } from './media-youtube-search.js';

describe('YouTube search', () => {
	it('asks for embeddable videos and ignores malformed results', async () => {
		let requestedUrl = '';
		const request = async (input: RequestInfo | URL) => {
			requestedUrl = String(input);
			return Response.json({
				items: [
					{
						id: { videoId: 'dQw4w9WgXcQ' },
						snippet: { title: 'A song &amp; dance', channelTitle: 'An artist' }
					},
					{ id: { videoId: '../../bad' }, snippet: { title: 'Bad video' } }
				]
			});
		};
		expect(await searchYouTubeVideos(' A song ', { key: 'test-key', request })).toEqual({
			results: [{ videoId: 'dQw4w9WgXcQ', title: 'A song & dance', channel: 'An artist' }]
		});
		const url = new URL(requestedUrl);
		expect(url.origin).toBe('https://www.googleapis.com');
		expect(url.searchParams.get('q')).toBe('A song');
		expect(url.searchParams.get('type')).toBe('video');
		expect(url.searchParams.get('videoEmbeddable')).toBe('true');
	});

	it('does not spend quota on an empty query and reports API refusal', async () => {
		const request = vi.fn(async () => new Response(null, { status: 403 }));
		expect(await searchYouTubeVideos('  ', { key: 'test-key', request })).toEqual({ results: [] });
		expect(request).not.toHaveBeenCalled();
		expect(await searchYouTubeVideos('song', { key: 'test-key', request })).toEqual({
			error: 'YouTube search is unavailable right now.'
		});
	});
});
