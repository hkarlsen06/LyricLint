export async function copyText(text: string): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) {
		throw new Error('Clipboard access is unavailable.');
	}

	await navigator.clipboard.writeText(text);
}

/**
 * The lyrics, exactly as the canonical string has them.
 *
 * A separate name for the same write because it is the application's one
 * output, and every caller of it means that rather than "put a string on the
 * clipboard" — which is what {@link copyText} is for.
 */
export const copyCanonicalMarkup = copyText;

/**
 * Read plain text from the system clipboard.
 *
 * Firefox gates `readText` behind its own paste prompt and Safari denies it
 * outside a user gesture, so callers must treat a rejection as ordinary rather
 * than exceptional: the keyboard paste path is still open, and that is what the
 * caller is expected to fall back to.
 */
export async function readClipboardText(): Promise<string> {
	if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
		throw new Error('Clipboard reads are unavailable.');
	}

	return navigator.clipboard.readText();
}

function downloadBlob(blob: Blob, filename: string): void {
	if (typeof document === 'undefined') {
		return;
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function downloadUtf8Text(
	text: string,
	filename: string,
	mimeType = 'text/plain;charset=utf-8'
): void {
	const bytes = new TextEncoder().encode(text);
	downloadBlob(new Blob([bytes], { type: mimeType }), filename);
}

/**
 * Save a picture that lives on somebody else's CDN.
 *
 * `download` on an anchor is ignored cross-origin, and every cover this
 * application has to offer comes from Apple's, Spotify's or Google's host — so
 * an anchor pointed straight at one navigates away from the workbench instead
 * of saving anything. The bytes have to come through `fetch` before there is a
 * blob of ours to name.
 *
 * That fetch is the half that can be refused: an `<img>` needs no CORS header
 * and a fetch does, so a host can perfectly well draw the cover in the panel
 * and decline to hand it over here. The fallback opens it in a tab, which is
 * one more press to save it rather than a button that does nothing.
 */
export async function downloadImage(
	url: string,
	filename: string,
	request: typeof fetch = fetch
): Promise<void> {
	try {
		const response = await request(url);
		if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
		downloadBlob(await response.blob(), filename);
	} catch {
		window.open(url, '_blank', 'noopener');
	}
}
