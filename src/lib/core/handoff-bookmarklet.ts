import { siteUrl } from '../seo.js';

/**
 * `maxHandoffPayloadLength`, which the test holds this to. Importing it would
 * load the hand-over codec on the docs page that draws the link.
 */
const payloadLimit = 400_000;

/**
 * Runs on the transcriber's Genius tab, not here: `handoffBookmarklet` turns
 * this function's source into a `javascript:` link, so it may use nothing
 * outside its own body and its arguments.
 *
 * It reads the lyric from the focused textarea, the focused editable box, or
 * the selection, in that order, and opens it in a new workbench tab in the
 * fragment form `decodeHandoff` reads.
 */
export async function openInLyricLint(workbenchUrl: string, maxPayloadLength: number) {
	const focused = document.activeElement;
	let text: string;
	if (focused instanceof HTMLTextAreaElement) text = focused.value;
	else if (focused instanceof HTMLElement && focused.isContentEditable) {
		// `innerText` reads a browser's blank line, `<div><br></div>`, as two
		// line breaks, so every stanza break would double.
		text = '';
		const read = (node: Node) => {
			for (const child of node.childNodes) {
				if (child instanceof Text) {
					const style = getComputedStyle(child.parentElement ?? focused);
					if (style.visibility !== 'visible') continue;
					// Collapsed as the page draws it, unless the box keeps its spacing.
					// Spacing at the start of a line is markup layout, never drawn.
					if (/^(pre|break-spaces)/.test(style.whiteSpace)) text += child.data;
					else {
						const collapsed = child.data.replace(/[ \t\n\r\f]+/g, ' ');
						if (collapsed !== ' ' || (text !== '' && !text.endsWith('\n'))) text += collapsed;
					}
				} else if (child instanceof HTMLBRElement) text += '\n';
				else if (child instanceof Element) {
					const display = getComputedStyle(child).display;
					if (display === 'none') continue;
					const block = !display.startsWith('inline');
					if (block && text !== '' && !text.endsWith('\n')) text += '\n';
					read(child);
					if (block && !text.endsWith('\n')) text += '\n';
				}
			}
		};
		read(focused);
		text = text.replace(/^ +| +$/gm, '').replace(/\n$/, '');
	} else text = String(getSelection() ?? '');
	if (text.trim() === '') {
		alert('Click into the lyrics box first, then press Open in LyricLint again.');
		return;
	}

	const json = JSON.stringify({ text, title: document.title, geniusUrl: location.href });
	const deflated = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const bytes = new Uint8Array(await new Response(deflated).arrayBuffer());
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 8192) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
	}
	const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	if (payload.length > maxPayloadLength) {
		alert('These lyrics are too long to open in LyricLint.');
		return;
	}
	window.open(`${workbenchUrl}#open=1.${payload}`, '_blank', 'noopener');
}

/** The `javascript:` link a transcriber drags to the bookmarks bar. */
export function handoffBookmarklet(workbenchUrl = siteUrl('/workbench/')): string {
	const call = `void (${openInLyricLint.toString()})(${JSON.stringify(workbenchUrl)}, ${payloadLimit})`;
	// A `javascript:` URL is percent-decoded before it runs.
	return `javascript:${encodeURIComponent(call)}`;
}
