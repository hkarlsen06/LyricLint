import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
	decodeHandoff,
	encodeHandoff,
	maxHandoffInflatedBytes,
	maxHandoffPayloadLength,
	maxHandoffTitleLength,
	type DraftHandoff
} from './handoff.js';

const cityLights: string = JSON.parse(
	readFileSync('scripts/fixtures/city-lights.json', 'utf8')
).lyrics;

/** A fragment around arbitrary bytes, for the cases `encodeHandoff` cannot write. */
async function fragmentFor(bytes: Uint8Array<ArrayBuffer> | string): Promise<string> {
	const deflated = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const packed = Buffer.from(await new Response(deflated).arrayBuffer());
	return `#open=1.${packed.toString('base64url')}`;
}

describe('handoff round trip', () => {
	test.each<[string, DraftHandoff]>([
		[
			'Latin',
			{
				text: cityLights,
				title: 'City Lights',
				geniusUrl: 'https://genius.com/Example-city-lights-lyrics'
			}
		],
		['right-to-left', { text: '[מקהלה]\nשלום עולם\n\n[Chorus]\nمرحبا بالعالم', title: 'שלום' }],
		['CJK', { text: '[Verse 1]\n東京の夜に 光る街\n서울의 밤\n北京欢迎你', title: '東京の夜' }],
		['emoji', { text: '[Hook]\n🎤🔥 on the mic\n👩‍👩‍👧‍👦 🏳️‍🌈 🇳🇴', title: '🎤 Mic' }],
		['combining marks', { text: 'Café vs Café\nTiếng Việt\nZ̵̡a̷lgo', title: 'Café' }],
		['markup as plain text', { text: '<img src=x onerror=alert(1)>\n<i>[Bridge]</i>' }]
	])('%s text comes back exact', async (_, handoff) => {
		const fragment = await encodeHandoff(handoff);
		expect(fragment).toMatch(/^#open=1\.[A-Za-z0-9_-]+$/);
		expect(await decodeHandoff(fragment)).toEqual(handoff);
	});

	test('City Lights fits a short link', async () => {
		expect((await encodeHandoff({ text: cityLights })).length).toBeLessThan(600);
	});
});

describe('handoff refusals', () => {
	test.each([
		['no fragment', ''],
		['another fragment', '#panel=song'],
		['an unknown version', '#open=2.qwerty'],
		['a missing version', '#open=qwerty'],
		['a missing hash', 'open=1.qwerty'],
		['an empty payload', '#open=1.'],
		['characters outside base64url', '#open=1.ab+c/d=='],
		['bytes that are not deflate data', '#open=1.____________']
	])('refuses %s', async (_, fragment) => {
		expect(await decodeHandoff(fragment)).toBeNull();
	});

	test('refuses a payload over the length limit before decoding it', async () => {
		expect(await decodeHandoff(`#open=1.${'A'.repeat(maxHandoffPayloadLength + 1)}`)).toBeNull();
	});

	test('refuses a short payload that inflates to megabytes', async () => {
		// Valid JSON once inflated, so only the byte limit can refuse it.
		const fragment = await fragmentFor(JSON.stringify({ text: 'a'.repeat(7_600_000) }));
		expect(fragment.length).toBeLessThan(10_000);
		expect(await decodeHandoff(fragment)).toBeNull();
	});

	test('reads exactly the inflated limit and refuses one byte more', async () => {
		const padding = maxHandoffInflatedBytes - JSON.stringify({ text: '' }).length;
		const atLimit = JSON.stringify({ text: 'a'.repeat(padding) });
		expect(new TextEncoder().encode(atLimit).byteLength).toBe(maxHandoffInflatedBytes);
		expect((await decodeHandoff(await fragmentFor(atLimit)))?.text).toHaveLength(padding);
		const overLimit = JSON.stringify({ text: 'a'.repeat(padding + 1) });
		expect(await decodeHandoff(await fragmentFor(overLimit))).toBeNull();
	});

	test('refuses a truncated payload', async () => {
		const fragment = await encodeHandoff({ text: cityLights });
		const middle = Math.floor(fragment.length / 2);
		expect(await decodeHandoff(fragment.slice(0, middle) + fragment.slice(middle + 10))).toBeNull();
		expect(await decodeHandoff(fragment.slice(0, -10))).toBeNull();
	});

	test('refuses bytes that are not UTF-8', async () => {
		const bytes = new Uint8Array([0x7b, 0x22, 0x74, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d]);
		expect(await decodeHandoff(await fragmentFor(bytes))).toBeNull();
	});

	test.each([
		['not JSON', '{"text":'],
		['an array', '["text"]'],
		['a string', '"text"'],
		['null', 'null'],
		['a missing text', '{"title":"Song"}'],
		['an empty text', '{"text":""}'],
		['a blank text', '{"text":" \\n\\t "}'],
		['a numeric text', '{"text":42}'],
		['an object text', '{"text":{"toString":"x"}}']
	])('refuses %s', async (_, json) => {
		expect(await decodeHandoff(await fragmentFor(json))).toBeNull();
	});
});

describe('handoff optional fields', () => {
	test('drops a link that is not a Genius page and keeps the lyric', async () => {
		for (const geniusUrl of [
			'javascript:alert(1)',
			'https://evil.example/Artist-song-lyrics',
			'https://user:pass@genius.com/Artist-song-lyrics',
			'https://genius.com/',
			42
		]) {
			const fragment = await fragmentFor(JSON.stringify({ text: 'Line', geniusUrl }));
			expect(await decodeHandoff(fragment)).toEqual({ text: 'Line' });
		}
	});

	test('normalizes a Genius link', async () => {
		const fragment = await fragmentFor(
			JSON.stringify({ text: 'Line', geniusUrl: '  https://GENIUS.com/Artist-song-lyrics ' })
		);
		expect((await decodeHandoff(fragment))?.geniusUrl).toBe(
			'https://genius.com/Artist-song-lyrics'
		);
	});

	test('cuts the title between whole characters, never inside a joined emoji', async () => {
		const family = '👩‍👩‍👧‍👦';
		for (const lead of [maxHandoffTitleLength - 4, maxHandoffTitleLength - 3]) {
			const decoded = await decodeHandoff(
				await encodeHandoff({ text: '[Verse]\nLine', title: 'a'.repeat(lead) + family })
			);
			expect(decoded?.title).toBe('a'.repeat(lead));
		}
		const fits = 'a'.repeat(maxHandoffTitleLength - 7) + family;
		expect(
			(await decodeHandoff(await encodeHandoff({ text: '[Verse]\nLine', title: fits })))?.title
		).toBe(fits);
	});

	test('trims the title, caps it in code points, and drops a blank or foreign one', async () => {
		const decode = async (title: unknown) =>
			(await decodeHandoff(await fragmentFor(JSON.stringify({ text: 'Line', title }))))?.title;
		expect(await decode('  City Lights  ')).toBe('City Lights');
		expect(await decode('🎤'.repeat(maxHandoffTitleLength + 5))).toBe(
			'🎤'.repeat(maxHandoffTitleLength)
		);
		expect(await decode('   ')).toBeUndefined();
		expect(await decode(['City Lights'])).toBeUndefined();
	});

	test('makes the title one plain line', async () => {
		const decode = async (title: string) =>
			(await decodeHandoff(await fragmentFor(JSON.stringify({ text: 'Line', title }))))?.title;
		expect(await decode('City\nLights')).toBe('City Lights');
		expect(await decode('City \r\n\t Lights Remix\u0085Live')).toBe('City Lights Remix Live');
		expect(await decode('‮gnos‬ ⁧שלום⁩ ⁦x⁩')).toBe('gnos שלום x');
		expect(await decode('\u0000\u001B[31m\u007F')).toBe('[31m');
		expect(await decode('\n‮⁩\n')).toBeUndefined();
	});
});
