import { normalizeGeniusUrl } from './genius-url.js';

/** A lyric another page hands to the workbench to open as a new draft. */
export interface DraftHandoff {
	text: string;
	title?: string;
	geniusUrl?: string;
}

const fragmentPrefix = '#open=1.';

/** What `JSON.parse` can return, or a key the payload does not have. */
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject | undefined;

interface JsonObject {
	readonly [key: string]: JsonValue;
}

/** The longest payload read; anything longer is refused before it is decoded. */
export const maxHandoffPayloadLength = 400_000;
/** The most inflated bytes read; the stream is cancelled once it passes this. */
export const maxHandoffInflatedBytes = 1_048_576;
/** In code points, so a cut never splits a surrogate pair. */
export const maxHandoffTitleLength = 200;

/** The URL fragment, `#open=1.<payload>`, that carries `handoff`. */
export async function encodeHandoff(handoff: DraftHandoff): Promise<string> {
	const json = new Blob([JSON.stringify(handoff)]);
	const deflated = json.stream().pipeThrough(new CompressionStream('deflate-raw'));
	const bytes = new Uint8Array(await new Response(deflated).arrayBuffer());
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const base64url = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
	return `${fragmentPrefix}${base64url}`;
}

/**
 * Read a fragment written by `encodeHandoff`, or `null` when it is not one.
 *
 * Any website can link here, so every byte is untrusted: the payload is
 * size-checked before it is decoded and the inflated stream is counted while it
 * is read, which stops a small payload that inflates to gigabytes at the limit.
 */
export async function decodeHandoff(fragment: string): Promise<DraftHandoff | null> {
	if (!fragment.startsWith(fragmentPrefix)) return null;
	const payload = fragment.slice(fragmentPrefix.length);
	if (payload.length > maxHandoffPayloadLength || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;

	let value: JsonValue;
	try {
		const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		const inflated = await readInflated(bytes);
		if (!inflated) return null;
		value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated));
	} catch {
		return null;
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const { text, title, geniusUrl } = value;
	if (typeof text !== 'string' || text.trim().length === 0) return null;

	const handoff: DraftHandoff = { text };
	if (typeof title === 'string') {
		const trimmed = Array.from(title.trim()).slice(0, maxHandoffTitleLength).join('').trim();
		if (trimmed) handoff.title = trimmed;
	}
	const url = normalizeGeniusUrl(geniusUrl);
	if (url !== undefined) handoff.geniusUrl = url;
	return handoff;
}

async function readInflated(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
	const reader = new Blob([bytes])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'))
		.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxHandoffInflatedBytes) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const inflated = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		inflated.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return inflated;
}
