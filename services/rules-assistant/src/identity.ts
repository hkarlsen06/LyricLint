/**
 * Anonymous identity: Turnstile validation, the signed session cookie, and the
 * HMAC hashing that keeps raw IPs and session ids out of storage and logs.
 *
 * The cookie payload is `v1.<base64url payload>.<base64url hmac>` where the
 * payload is JSON: { sid, iat, uses }. `uses` counts successful requests since
 * the last Turnstile pass so the Worker can rechallenge after ten.
 *
 * **That cadence is advisory, and deliberately so.** `uses` lives only in the
 * cookie, so a client that replays the copy it was first issued keeps the count
 * at zero and is never rechallenged inside the cookie's TTL. What replaying
 * buys is one Turnstile pass instead of several — and nothing else: the minute
 * throttles, the daily counts, the concurrency slots and the spend ceilings are
 * all keyed on the session and IP hashes in the Durable Objects, which the
 * cookie cannot move, and `abuseHash` still forces a fresh challenge the moment
 * the network signal changes. Counting uses in the session QuotaCounter instead
 * would put a Durable Object round trip in front of Turnstile on every request,
 * including the ones the challenge gate exists to refuse before they cost
 * anything.
 */
import { SESSION_RULES, TURNSTILE_HOSTNAMES } from './config';
import { ApiError } from './errors';

export interface SessionState {
	/** Random anonymous session id (not derived from anything identifying). */
	sid: string;
	/** Issued-at, ms epoch. */
	iat: number;
	/** Successful requests since the last Turnstile validation. */
	uses: number;
	/** HMAC-hashed network abuse signal at the last successful challenge. */
	abuseHash?: string;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array {
	const padded = text.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

export async function signSession(state: SessionState, secret: string): Promise<string> {
	const payload = base64url(encoder.encode(JSON.stringify(state)));
	const key = await hmacKey(secret);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
	return `v1.${payload}.${base64url(mac)}`;
}

export async function verifySession(
	token: string | undefined,
	secret: string,
	now: number
): Promise<SessionState | undefined> {
	if (!token) return undefined;
	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') return undefined;
	const [, payload, mac] = parts as [string, string, string];
	try {
		const key = await hmacKey(secret);
		const valid = await crypto.subtle.verify(
			'HMAC',
			key,
			fromBase64url(mac),
			encoder.encode(payload)
		);
		if (!valid) return undefined;
		const state = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as SessionState;
		if (
			typeof state.sid !== 'string' ||
			typeof state.iat !== 'number' ||
			typeof state.uses !== 'number' ||
			(state.abuseHash !== undefined && typeof state.abuseHash !== 'string')
		) {
			return undefined;
		}
		if (now - state.iat > SESSION_RULES.cookieTtlMs) return undefined;
		return state;
	} catch {
		return undefined;
	}
}

export function sessionCookie(token: string, secure = true): string {
	const maxAge = Math.floor(SESSION_RULES.cookieTtlMs / 1000);
	return `${SESSION_RULES.cookieName}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict`;
}

export function readSessionCookie(request: Request): string | undefined {
	const header = request.headers.get('cookie');
	if (!header) return undefined;
	for (const part of header.split(';')) {
		const [name, ...rest] = part.trim().split('=');
		if (name === SESSION_RULES.cookieName) return rest.join('=');
	}
	return undefined;
}

export interface TurnstileVerifier {
	(token: string, remoteIp: string | undefined): Promise<boolean>;
}

export function turnstileVerifier(
	secret: string,
	allowLocalhost = false,
	fetcher: typeof fetch = fetch
): TurnstileVerifier {
	return async (token, remoteIp) => {
		const body = new URLSearchParams({
			secret,
			response: token,
			idempotency_key: crypto.randomUUID()
		});
		if (remoteIp) body.set('remoteip', remoteIp);
		const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body
		});
		if (!response.ok) throw new ApiError('provider_error', 'Challenge verification unavailable.');
		const result = (await response.json()) as { success?: boolean; hostname?: string };
		if (result.success !== true) return false;
		const allowed = new Set<string>(TURNSTILE_HOSTNAMES);
		if (allowLocalhost) {
			allowed.add('localhost');
			allowed.add('127.0.0.1');
		}
		if (!result.hostname || !allowed.has(result.hostname)) {
			throw new ApiError('challenge_required', 'Complete the challenge and try again.');
		}
		return true;
	};
}

/** HMAC-hash an abuse identifier (session id or IP) so raw values never reach
 * storage, Durable Object keys, or metrics. */
export async function hashIdentifier(
	kind: 'ip' | 'session',
	value: string,
	secret: string
): Promise<string> {
	const key = await hmacKey(secret);
	const mac = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(`${kind}:${value}`))
	);
	return base64url(mac).slice(0, 32);
}

/** Privacy-preserving stable identifier forwarded to OpenAI as `safety_identifier`. */
export async function safetyIdentifier(sid: string, secret: string): Promise<string> {
	return `ll-${await hashIdentifier('session', sid, secret)}`;
}
