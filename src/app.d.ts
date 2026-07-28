// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

/**
 * The Spotify app this build authorizes against, inlined by Vite.
 *
 * Optional on purpose: a checkout without it builds and runs, and the picker
 * simply does not offer Spotify. See `spotifyClientId` in `spotify-auth.ts`.
 */
interface ImportMetaEnv {
	readonly PUBLIC_SPOTIFY_CLIENT_ID?: string;
	/**
	 * The signed Apple Music developer token, valid for at most six months.
	 *
	 * Optional for the same reason, and checked for expiry rather than presence —
	 * see `appleMusicConfigured` in `media-apple.ts`.
	 */
	readonly PUBLIC_APPLE_MUSIC_TOKEN?: string;
	/**
	 * What a development tab calls itself, in place of the draft's own name.
	 *
	 * Optional like the two above, and read only out of a dev build — see
	 * `DocumentTitle.svelte`.
	 */
	readonly PUBLIC_DEV_TAB_TITLE?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface merging
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
