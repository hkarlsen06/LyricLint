export async function copyCanonicalMarkup(text: string): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) {
		throw new Error('Clipboard access is unavailable.');
	}

	await navigator.clipboard.writeText(text);
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
