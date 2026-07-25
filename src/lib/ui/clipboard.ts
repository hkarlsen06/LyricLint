export async function copyCanonicalMarkup(text: string): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) {
		throw new Error('Clipboard access is unavailable.');
	}

	await navigator.clipboard.writeText(text);
}

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

export function downloadUtf8Text(text: string, filename: string): void {
	if (typeof document === 'undefined') {
		return;
	}

	const bytes = new TextEncoder().encode(text);
	const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain;charset=utf-8' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
