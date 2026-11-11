import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { decodeHandoff, maxHandoffPayloadLength } from './handoff.js';
import { handoffBookmarklet, openInLyricLint } from './handoff-bookmarklet.js';

const workbench = 'https://lyriclint.test/workbench/';
const focusFirst = 'Click into the lyrics box first, then press Open in LyricLint again.';

let opened: MockInstance<typeof window.open>;
let alerted: MockInstance<typeof window.alert>;

beforeEach(() => {
	opened = vi.spyOn(window, 'open').mockReturnValue(null);
	alerted = vi.spyOn(window, 'alert').mockReturnValue(undefined);
	document.title = 'Example – City Lights Lyrics | Genius Lyrics';
});

afterEach(() => {
	vi.restoreAllMocks();
	getSelection()?.removeAllRanges();
	(document.activeElement as HTMLElement | null)?.blur();
	document.body.replaceChildren();
});

function mount(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	document.body.append(host);
	return host;
}

/** The one link opened, checked for its target and `noopener`, as a fragment. */
function openedFragment(): string {
	expect(opened).toHaveBeenCalledOnce();
	const [url, target, features] = opened.mock.calls[0]!;
	expect(target).toBe('_blank');
	expect(features).toBe('noopener');
	const href = String(url);
	expect(href.startsWith(`${workbench}#open=1.`)).toBe(true);
	return href.slice(workbench.length);
}

async function openedText(): Promise<string | undefined> {
	return (await decodeHandoff(openedFragment()))?.text;
}

describe('openInLyricLint', () => {
	it('sends the focused textarea’s exact value with the page title and address', async () => {
		const lyric = '[Verse 1]\n<i>City lights</i> are  calling\n\n[Chorus]\nOh, oh\n';
		const box = mount('<textarea></textarea>').querySelector('textarea')!;
		box.value = lyric;
		box.focus();

		await openInLyricLint(workbench, maxHandoffPayloadLength);

		const fragment = openedFragment();
		const handoff = await decodeHandoff(fragment);
		expect(handoff?.text).toBe(lyric);
		expect(handoff?.title).toBe(document.title);
		// The test page is not on Genius, so the decoder drops the address; the
		// raw payload shows it was sent.
		const bytes = Uint8Array.from(
			atob(fragment.slice('#open=1.'.length).replaceAll('-', '+').replaceAll('_', '/')),
			(character) => character.charCodeAt(0)
		);
		const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		expect(JSON.parse(await new Response(inflated).text()).geniusUrl).toBe(location.href);
		expect(alerted).not.toHaveBeenCalled();
	});

	it('sends the focused editable box’s text, one line per visual line and no markup', async () => {
		const box = mount(
			'<div contenteditable="true">[Chorus]<br>City <i>lights</i> calling<br>Oh, oh</div>'
		).firstElementChild as HTMLElement;
		box.focus();

		await openInLyricLint(workbench, maxHandoffPayloadLength);

		expect(await openedText()).toBe('[Chorus]\nCity lights calling\nOh, oh');
	});

	it('sends the selection when no lyrics box is focused', async () => {
		const host = mount(
			'<p>Before</p><div>First line</div><div>Second line</div><div>Third line</div><p>After</p>'
		);
		const lines = host.querySelectorAll('div');
		const range = document.createRange();
		range.setStart(lines[0]!.firstChild!, 0);
		range.setEnd(lines[2]!.firstChild!, 'Third line'.length);
		getSelection()!.addRange(range);

		await openInLyricLint(workbench, maxHandoffPayloadLength);

		expect(await openedText()).toBe('First line\nSecond line\nThird line');
	});

	it('asks for the lyrics box and opens nothing when there is no lyric', async () => {
		const box = mount('<textarea>  \n </textarea>').querySelector('textarea')!;

		await openInLyricLint(workbench, maxHandoffPayloadLength);
		box.focus();
		await openInLyricLint(workbench, maxHandoffPayloadLength);

		expect(alerted.mock.calls).toEqual([[focusFirst], [focusFirst]]);
		expect(opened).not.toHaveBeenCalled();
	});

	it('says the lyric is too long instead of opening a link the workbench refuses', async () => {
		const box = mount('<textarea></textarea>').querySelector('textarea')!;
		box.value = 'A line the workbench would refuse at this limit';
		box.focus();

		await openInLyricLint(workbench, 16);

		expect(alerted).toHaveBeenCalledExactlyOnceWith(
			'These lyrics are too long to open in LyricLint.'
		);
		expect(opened).not.toHaveBeenCalled();
	});
});

describe('handoffBookmarklet', () => {
	it('is a link that runs on its own and opens the focused lyric', async () => {
		const lyric = '[Intro]\nשלום, 世界 🎤\n<b>Encore</b> 100% & "more"\n';
		const box = mount('<textarea></textarea>').querySelector('textarea')!;
		box.value = lyric;
		box.focus();

		const link = handoffBookmarklet(workbench);
		expect(link.startsWith('javascript:')).toBe(true);
		// What a browser does with a `javascript:` URL: percent-decode it and run
		// it as a classic script, with nothing of this module in scope.
		const script = document.createElement('script');
		script.textContent = decodeURIComponent(link.slice('javascript:'.length));
		document.body.append(script);

		await expect.poll(() => opened.mock.calls.length).toBe(1);
		expect(await openedText()).toBe(lyric);
	});

	it('opens the production workbench by default', () => {
		const call = decodeURIComponent(handoffBookmarklet().slice('javascript:'.length));
		expect(call).toContain('"https://lyriclint.com/workbench/"');
		expect(call).toContain(`, ${maxHandoffPayloadLength})`);
	});
});
