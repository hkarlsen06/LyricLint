/**
 * Turnstile, loaded only when the backend has actually asked for a challenge —
 * the same rule every third-party script here follows: nothing contacts anyone
 * until a press needs it. The site key is committed like the Spotify client id
 * (it is not a secret and resolves at build time); `PUBLIC_TURNSTILE_SITE_KEY`
 * overrides it, and an empty value reports the challenge as unavailable rather
 * than rendering a widget that cannot pass.
 */

const DEFAULT_SITE_KEY = '0x4AAAAAAALyricLintAssistant';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
	render(
		container: HTMLElement,
		options: { sitekey: string; callback(token: string): void; 'error-callback'?(): void }
	): string;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export function turnstileSiteKey(): string {
	const configured = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
	if (configured !== undefined) return configured.trim();
	return DEFAULT_SITE_KEY;
}

let loading: Promise<TurnstileApi> | undefined;

function loadScript(): Promise<TurnstileApi> {
	loading ??= new Promise((resolve, reject) => {
		if (window.turnstile) {
			resolve(window.turnstile);
			return;
		}
		const script = document.createElement('script');
		script.src = SCRIPT_URL;
		script.async = true;
		script.onload = () => {
			if (window.turnstile) resolve(window.turnstile);
			else reject(new Error('Turnstile loaded without its API.'));
		};
		script.onerror = () => {
			loading = undefined;
			reject(new Error('Turnstile failed to load.'));
		};
		document.head.append(script);
	});
	return loading;
}

export interface ChallengeHandle {
	/** Resolves with a token once the visitor passes. */
	token: Promise<string>;
	destroy(): void;
}

/** Render a challenge into `container` and hand back the token when passed. */
export async function renderChallenge(container: HTMLElement): Promise<ChallengeHandle> {
	const siteKey = turnstileSiteKey();
	if (!siteKey) throw new Error('No Turnstile site key is configured.');
	const api = await loadScript();
	let widgetId: string | undefined;
	const token = new Promise<string>((resolve, reject) => {
		widgetId = api.render(container, {
			sitekey: siteKey,
			callback: resolve,
			'error-callback': () => reject(new Error('The challenge could not run.'))
		});
	});
	return {
		token,
		destroy() {
			if (widgetId !== undefined) api.remove(widgetId);
		}
	};
}
