import { isYouTubeVideoId } from './media-youtube.js';

export interface YouTubeSearchResult {
	videoId: string;
	title: string;
	channel: string;
}

export type YouTubeSearchOutcome = { results: YouTubeSearchResult[] } | { error: string };

function apiKey(): string | undefined {
	return import.meta.env.PUBLIC_YOUTUBE_API_KEY?.trim() || undefined;
}

export function youtubeSearchConfigured(): boolean {
	return apiKey() !== undefined;
}

function displayText(value: string): string {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>');
}

export async function searchYouTubeVideos(
	query: string,
	deps: { request?: typeof fetch; key?: string } = {}
): Promise<YouTubeSearchOutcome> {
	if (query.trim() === '') return { results: [] };
	const key = deps.key ?? apiKey();
	if (!key) return { error: 'YouTube search is not configured for this build.' };
	const url = new URL('https://www.googleapis.com/youtube/v3/search');
	url.search = new URLSearchParams({
		part: 'snippet',
		type: 'video',
		videoEmbeddable: 'true',
		maxResults: '10',
		q: query.trim(),
		key
	}).toString();
	try {
		const response = await (deps.request ?? fetch)(url);
		if (!response.ok) return { error: 'YouTube search is unavailable right now.' };
		const body: unknown = await response.json();
		if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)) {
			return { error: 'YouTube search returned an invalid response.' };
		}
		const results: YouTubeSearchResult[] = [];
		for (const item of body.items) {
			if (!item || typeof item !== 'object') continue;
			const { id, snippet } = item;
			if (!id || typeof id !== 'object' || !snippet || typeof snippet !== 'object') continue;
			if (
				typeof id.videoId !== 'string' ||
				!isYouTubeVideoId(id.videoId) ||
				typeof snippet.title !== 'string' ||
				snippet.title.trim() === ''
			)
				continue;
			results.push({
				videoId: id.videoId,
				title: displayText(snippet.title),
				channel: typeof snippet.channelTitle === 'string' ? displayText(snippet.channelTitle) : ''
			});
		}
		return { results };
	} catch {
		return { error: 'YouTube search could not be reached.' };
	}
}
