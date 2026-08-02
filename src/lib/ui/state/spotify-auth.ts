/**
 * Signing in to Spotify from a page with no server behind it.
 *
 * Authorization Code with PKCE is the only OAuth flow that fits: it is the one
 * designed for clients that cannot keep a secret, and this application is a
 * folder of static files on a CDN. There is no client secret anywhere in here,
 * and there is no back end to put one in.
 *
 * **Nothing outlives the tab, and that is deliberate.** A refresh token in
 * `localStorage` is a credential at rest in a tool whose whole promise is that
 * it keeps nothing, and it would let a page nobody has touched reach Spotify on
 * load — the exact thing `youtubeAllowed` exists to prevent. So everything here
 * lives in `sessionStorage`: the PKCE verifier and the intent across the
 * redirect, and the tokens for as long as the tab is open.
 *
 * The tokens were held in module memory first, and that was stricter than this
 * file's own stated rule rather than safer than it. Module memory dies on
 * **reload**, so every refresh of the workbench sent the user back to Spotify's
 * authorize screen for a session the browser still considered open — a full page
 * redirect to re-establish something that had not actually ended. A browser
 * session survives a reload and ends with the tab, so `sessionStorage` is what
 * "session-scoped" already meant. It buys an attacker nothing either: script
 * that could read it can already read the in-memory copy.
 */

const authorizeEndpoint = 'https://accounts.spotify.com/authorize';
const tokenEndpoint = 'https://accounts.spotify.com/api/token';

/**
 * What the Web Playback SDK needs, and nothing beyond it.
 *
 * `streaming` is playback itself. The two `user-read` scopes are not optional
 * decoration — the SDK refuses to initialise without them, because it checks the
 * account's product tier before it will hand over a device. `user-modify-playback-state`
 * is the one call the SDK cannot make for itself: starting a specific track on
 * the device it just created.
 */
const scopes = [
	'streaming',
	'user-read-email',
	'user-read-private',
	'user-modify-playback-state'
].join(' ');

const verifierKey = 'lyriclint:spotify:verifier';
const intentKey = 'lyriclint:spotify:intent';
const stateKey = 'lyriclint:spotify:state';
const tokenKey = 'lyriclint:spotify:tokens';

/** How long before an access token actually expires it is treated as expired. */
const refreshMarginMs = 30_000;

export interface SpotifyTokens {
	accessToken: string;
	refreshToken?: string;
	/** Epoch milliseconds, already carrying the safety margin. */
	expiresAt: number;
}

let tokens: SpotifyTokens | undefined;
let inFlight: Promise<string | undefined> | undefined;

/**
 * The tokens this tab holds, read back from the session on the first miss.
 *
 * No "already hydrated" flag: a miss re-reads, which costs one `getItem` on a
 * path that is about to make a network request anyway, and keeps the module
 * free of a second piece of state that could disagree with the first.
 */
function held(): SpotifyTokens | undefined {
	if (tokens !== undefined) return tokens;
	if (!inBrowser()) return undefined;
	try {
		const raw = sessionStorage.getItem(tokenKey);
		if (raw === null) return undefined;
		tokens = JSON.parse(raw) as SpotifyTokens;
	} catch {
		// Unparseable or storage refused. Either way there is no session here.
		return undefined;
	}
	return tokens;
}

function remember(next: SpotifyTokens | undefined): void {
	tokens = next;
	if (!inBrowser()) return;
	try {
		if (next === undefined) sessionStorage.removeItem(tokenKey);
		else sessionStorage.setItem(tokenKey, JSON.stringify(next));
	} catch {
		// Private mode, or storage full. The in-memory copy still serves this
		// page load; only surviving a reload is lost.
	}
}

/**
 * The app this build authorizes against, and **off unless a build sets one**.
 *
 * The id was hard-coded here for a while, on the reasoning that a client id is
 * public by definition — which is true, and beside the point. What settles it is
 * who can actually use the feature: extended quota has been organizations only
 * since May 2025 (a registered business, a launched service, 250,000 monthly
 * active users), so this app is capped at a hand-added allowlist forever. A
 * visitor who is not on it does not get a polite refusal; they are sent to
 * Spotify, sign in, and are turned away on Spotify's own error page, which is
 * the failure `spotifyRedirectAllowed` exists to prevent one step earlier.
 *
 * So the deployed build leaves `PUBLIC_SPOTIFY_CLIENT_ID` unset and the picker
 * offers only the two answers it can honestly carry out, while a machine on the
 * allowlist sets it in `.env.development.local` and gets the third — the
 * `.development.` variant specifically, because Vite loads `.env.local` for
 * `vite build` too and a local opt-in would then be baked into any bundle built
 * on that machine. Turning it back on the day the policy changes is one
 * variable.
 *
 * Read off `import.meta.env` rather than through either of SvelteKit's `$env`
 * modules, and both were tried first: `$env/static/public` will not compile
 * unless the variable is set, so a checkout without one could not build, and
 * `$env/dynamic/public` touches `process` at module scope, which does not exist
 * in the browser the component suite runs in and took nine unrelated test files
 * down with it. Vite resolves this at **build** time, so it has to be set where
 * the build runs — a Cloudflare Pages *runtime* variable or a `wrangler secret`
 * never reaches the bundle.
 */
export function spotifyClientId(): string | undefined {
	const configured = import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID?.trim();
	return configured === undefined || configured === '' ? undefined : configured;
}

export function spotifyConfigured(): boolean {
	return spotifyClientId() !== undefined;
}

/**
 * Where Spotify sends the user back.
 *
 * The workbench itself, so the flow needs no extra route and no popup. It must
 * match a redirect URI registered on the Spotify app exactly, trailing slash
 * included — `trailingSlash: 'always'` means this app's own URLs carry one.
 */
export function spotifyRedirectUri(): string {
	return new URL('/lint/', location.origin).toString();
}

/**
 * Whether Spotify will accept a redirect back to this origin at all.
 *
 * Two rules, and the first is the one that costs an afternoon: **`localhost` is
 * refused as a name, not as an insecure origin.** `https://localhost:5173` is a
 * genuine TLS origin with a trusted certificate behind it, and Spotify still
 * answers `redirect_uri: Insecure` — the message is about the host, and it wants
 * the loopback IP literal instead. Reading that error as a statement about the
 * scheme sends you to fix the one thing that was already right.
 *
 * Beyond that the origin must be HTTPS, or `127.0.0.1`, which Spotify exempts
 * because it unambiguously means this machine. `[::1]` is refused with
 * `localhost`: Spotify names `127.0.0.1` specifically, so the v6 loopback is not
 * a safe assumption.
 *
 * The tempting fix is to rewrite `localhost` to `127.0.0.1` on the way out, and
 * it is wrong: `sessionStorage` is scoped per origin, so the PKCE verifier
 * written under one host cannot be read back under the other, and the return
 * would fail a step later with a much stranger message. The origin has to be one
 * the user is genuinely on, so this reports rather than repairs.
 */
const refusedHosts = new Set(['localhost', '::1', '[::1]']);

/**
 * Whether there is a browser here at all.
 *
 * The controller calls `resumeSignIn` as it is built, and that is not always a
 * browser: the node half of the suite builds one, and a prerender would too. A
 * module that reads `location` at that moment takes the whole workbench down
 * with it, which is a lot of blast radius for a query string nobody asked about.
 */
function inBrowser(): boolean {
	return typeof location !== 'undefined';
}

export function spotifyRedirectAllowed(): boolean {
	if (!inBrowser()) return false;
	if (refusedHosts.has(location.hostname.toLowerCase())) return false;
	return location.protocol === 'https:' || location.hostname === '127.0.0.1';
}

/**
 * Why this origin will not do, and the exact address that will.
 *
 * It carries the URL to open rather than the rule to satisfy, because on the
 * failure this actually fires for — `localhost` over HTTPS — the rule reads as
 * though it has already been met, and a user who is told "needs HTTPS" while
 * looking at a padlock will go and change the wrong thing.
 */
export function spotifyInsecureOriginMessage(): string {
	const port = location.port === '' ? '' : `:${location.port}`;
	return `Spotify refuses to sign in from ${location.origin} — it rejects the name \`localhost\` even over HTTPS. Open https://127.0.0.1${port}/lint/ instead.`;
}

function base64url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function randomVerifier(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(48)).buffer);
}

async function challengeFor(verifier: string): Promise<string> {
	return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

/**
 * Leave for Spotify, remembering what the user was in the middle of.
 *
 * A full-page redirect rather than a popup: a popup is one more prerendered
 * route, a `postMessage` bridge, and a blocker to fall foul of, and the page it
 * would have saved is one the user is not typing into — attaching audio is the
 * one moment a reload costs nothing, because the draft is already autosaved and
 * the workbench boots back into it.
 */
export async function beginSpotifySignIn(intent: string): Promise<void> {
	const clientId = spotifyClientId();
	if (clientId === undefined) return;
	// Callers check this and say so; leaving without it would land the user on
	// Spotify's blank `redirect_uri: Insecure` page with nothing to act on.
	if (!spotifyRedirectAllowed()) return;

	const verifier = randomVerifier();
	const state = randomVerifier();
	try {
		sessionStorage.setItem(verifierKey, verifier);
		sessionStorage.setItem(intentKey, intent);
		sessionStorage.setItem(stateKey, state);
	} catch {
		// Private mode, or storage full. A redirect cannot be completed without
		// these values, so leave the page in place and let the caller finish cleanly.
		try {
			sessionStorage.removeItem(verifierKey);
			sessionStorage.removeItem(intentKey);
			sessionStorage.removeItem(stateKey);
		} catch {
			// The same refusal can apply to removal; nothing else can be done here.
		}
		return;
	}

	const url = new URL(authorizeEndpoint);
	url.search = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		redirect_uri: spotifyRedirectUri(),
		code_challenge_method: 'S256',
		code_challenge: await challengeFor(verifier),
		state,
		scope: scopes
	}).toString();

	location.assign(url.toString());
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error_description?: string;
	error?: string;
}

async function exchange(body: Record<string, string>): Promise<SpotifyTokens> {
	const response = await fetch(tokenEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body).toString()
	});
	const payload = (await response.json().catch(() => ({}))) as TokenResponse;
	if (!response.ok || payload.access_token === undefined) {
		throw new Error(payload.error_description ?? payload.error ?? 'Spotify refused the sign-in.');
	}
	return {
		accessToken: payload.access_token,
		...(payload.refresh_token === undefined ? {} : { refreshToken: payload.refresh_token }),
		expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 - refreshMarginMs
	};
}

export interface SpotifyReturn {
	/** What the user was attaching when they were sent away, if anything. */
	intent?: string;
	/** Set when Spotify sent back a refusal rather than a code. */
	error?: string;
}

/**
 * Pick the sign-in back up, if this load is the one coming back from Spotify.
 *
 * Answers `undefined` on an ordinary load, which is nearly every load. The query
 * is stripped either way — a `code` left in the address bar is a credential in
 * the user's history and in the next screenshot they take, and it would be
 * replayed on the following reload.
 */
export async function completeSpotifySignIn(): Promise<SpotifyReturn | undefined> {
	if (!inBrowser()) return undefined;
	const params = new URLSearchParams(location.search);
	const code = params.get('code');
	const refusal = params.get('error');
	if (code === null && refusal === null) return undefined;

	let verifier: string | null = null;
	let intent: string | undefined;
	let expectedState: string | null = null;
	try {
		verifier = sessionStorage.getItem(verifierKey);
		intent = sessionStorage.getItem(intentKey) ?? undefined;
		expectedState = sessionStorage.getItem(stateKey);
		sessionStorage.removeItem(verifierKey);
		sessionStorage.removeItem(intentKey);
		sessionStorage.removeItem(stateKey);
	} catch {
		// Storage refusal is the same as a missing verifier: this return cannot be
		// authenticated or exchanged safely.
	}
	const clean = new URL(location.href);
	clean.searchParams.delete('code');
	clean.searchParams.delete('state');
	clean.searchParams.delete('error');
	history.replaceState(history.state, '', `${clean.pathname}${clean.search}${clean.hash}`);

	if (params.get('state') === null || params.get('state') !== expectedState) {
		return { error: 'That Spotify sign-in could not be completed.' };
	}

	if (refusal !== null) return { error: 'Spotify sign-in was cancelled.' };
	if (code === null || verifier === null)
		return { error: 'That Spotify sign-in could not be completed.' };

	const clientId = spotifyClientId();
	if (clientId === undefined) return { error: 'Spotify is not configured for this build.' };

	try {
		remember(
			await exchange({
				grant_type: 'authorization_code',
				code,
				redirect_uri: spotifyRedirectUri(),
				client_id: clientId,
				code_verifier: verifier
			})
		);
	} catch (error) {
		return { error: error instanceof Error ? error.message : 'Spotify refused the sign-in.' };
	}

	return { ...(intent === undefined ? {} : { intent }) };
}

/** Whether this session has a Spotify token in hand. */
export function spotifySignedIn(): boolean {
	return held() !== undefined;
}

/**
 * A usable access token, refreshed if the one in hand has aged out.
 *
 * The SDK asks for this every time it needs one — including an hour into a
 * session, which is well inside a transcription — so the refresh is not
 * optional the way it would be for a one-shot API call. Concurrent callers share
 * one refresh, because the SDK and a `play` call routinely want a token in the
 * same tick and Spotify invalidates a refresh token once it has been spent.
 */
export async function spotifyAccessToken(): Promise<string | undefined> {
	const current = held();
	if (current === undefined) return undefined;
	if (Date.now() < current.expiresAt) return current.accessToken;

	const clientId = spotifyClientId();
	if (current.refreshToken === undefined || clientId === undefined) return undefined;

	inFlight ??= exchange({
		grant_type: 'refresh_token',
		refresh_token: current.refreshToken,
		client_id: clientId
	})
		.then((next) => {
			// Spotify does not always issue a new refresh token; keeping the old one
			// is what makes the second hour of a session work.
			remember({ ...next, refreshToken: next.refreshToken ?? current.refreshToken });
			return tokens?.accessToken;
		})
		.catch(() => {
			// A refused refresh is a session that is over, so it is cleared from
			// storage too — otherwise every later reload rehydrates a dead token and
			// spends a network round trip discovering that again.
			remember(undefined);
			return undefined;
		})
		.finally(() => {
			inFlight = undefined;
		});

	return await inFlight;
}

/** Test seam: hand the module a token without going near Spotify. */
export function setSpotifyTokens(next: SpotifyTokens | undefined): void {
	remember(next);
	inFlight = undefined;
}
