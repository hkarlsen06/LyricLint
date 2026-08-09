import type { MediaSourceKind } from '../state/media-player.svelte.js';

/**
 * The user gesture a remembered source is waiting for, named consistently in
 * both the transport strip and the Song panel.
 */
export function pendingMediaLabel(name: string, source: MediaSourceKind | undefined): string {
	return source === 'youtube'
		? `Load ${name} from YouTube`
		: source === 'spotify'
			? `Load ${name} from Spotify`
			: source === 'apple'
				? `Load ${name} from Apple Music`
				: `Reconnect ${name}`;
}

/** Compact form for a panel where the draft already supplies the song's name. */
export function pendingMediaActionLabel(source: MediaSourceKind | undefined): string {
	return source === 'youtube'
		? 'Load YouTube audio'
		: source === 'spotify'
			? 'Load Spotify audio'
			: source === 'apple'
				? 'Load Apple Music audio'
				: 'Reconnect audio';
}
