/*
 * Reproducible player footage, with the real workbench and a simulated provider.
 * MusicKit, catalogue responses and artwork are intercepted only in this fresh
 * capture page. No Apple account, real recording, or real lyrics are used.
 * All attachment, timing, transport, metadata and artwork controls are the app's.
 * The build still needs an unexpired PUBLIC_APPLE_MUSIC_TOKEN to offer Apple;
 * an isolated capture build may use an unsigned fixture token, since no request
 * reaches Apple. Never deploy that fixture token or write it to an env file.
 */

import { performersTranscription } from './shot-lyrics.mjs';

// Use the same opening verses and chorus as the performer demonstration.
export const playerTranscription = performersTranscription.split('\n\n').slice(0, 3).join('\n\n');

export const playerLineTimes = [
	[2, 4],
	[3, 8],
	[4, 12],
	[5, 16],
	[8, 24],
	[9, 28],
	[10, 32],
	[13, 40],
	[14, 44],
	[15, 48],
	[16, 52]
];

export const playerSong = {
	id: '9000000001',
	type: 'songs',
	attributes: {
		name: 'Leave the Radio On',
		artistName: 'Avery & Blair',
		albumName: 'The Long Way Home',
		composerName: 'Avery Lane & Blair Rowan',
		releaseDate: '2026-08-14',
		durationInMillis: 56000,
		artwork: {
			url: 'https://is1-ssl.mzstatic.com/image/thumb/lyriclint-capture-fixture/{w}x{h}.jpg'
		}
	},
	relationships: { albums: { data: [{ attributes: { recordLabel: 'Lantern Records' } }] } }
};

// Original geometric cover artwork; kept as source so the scene needs no
// separately maintained image or asset-generation service.
const cover = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
<rect width="640" height="640" fill="#19313b"/>
<circle cx="465" cy="230" r="94" fill="#e7b96c"/>
<path d="M0 343 170 262 364 358 640 292V640H0Z" fill="#2d5051"/>
<path d="M0 432 218 365 470 445 640 370V640H0Z" fill="#12272c"/>
<path d="M259 640 337 406 359 406 380 640" fill="#bb9770"/>
<path d="m315 640 28-225h5l-6 225" fill="#f5d79c"/>
<text x="45" y="71" font-family="sans-serif" font-size="19" letter-spacing="4" fill="#f6e8ce">AVERY &amp; BLAIR</text>
<text x="43" y="116" font-family="sans-serif" font-size="31" fill="#f6e8ce">THE LONG WAY HOME</text>
</svg>`;

/** Install before goto, so even the provider SDK never makes a live request. */
export async function installPlayerScene(page) {
	// The download command saves a JPEG, so the fixture provides real JPEG bytes
	// too. Rasterize the original SVG with the browser already used for capture.
	const artworkPage = await page.context().browser().newPage();
	let artwork;
	try {
		await artworkPage.setViewportSize({ width: 640, height: 640 });
		await artworkPage.setContent(
			`<style>body{margin:0}svg{display:block;width:640px;height:640px}</style>${cover}`
		);
		artwork = await artworkPage
			.locator('svg')
			.screenshot({ type: 'jpeg', quality: 95, scale: 'css' });
	} finally {
		await artworkPage.close();
	}
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.route('https://api.music.apple.com/**', async (route) => {
		const search = new URL(route.request().url()).pathname.endsWith('/search');
		await route.fulfill({
			json: search ? { results: { songs: { data: [playerSong] } } } : { data: [playerSong] }
		});
	});
	await page.route(
		'https://is1-ssl.mzstatic.com/image/thumb/lyriclint-capture-fixture/**',
		(route) => route.fulfill({ contentType: 'image/jpeg', body: artwork })
	);
	await page.route('https://js-cdn.music.apple.com/**', (route) => route.abort());
	await page.addInitScript(() => {
		const listeners = new Map();
		let playing = false;
		const states = { playing: 2, paused: 3, stopped: 4, ended: 5, completed: 6 };
		function emit(name, payload) {
			for (const handler of listeners.get(name) ?? []) handler(payload);
		}
		function timeChanged() {
			emit('playbackTimeDidChange', {
				currentPlaybackTime: instance.currentPlaybackTime,
				currentPlaybackDuration: instance.currentPlaybackDuration
			});
		}
		const instance = {
			isAuthorized: true,
			storefrontId: 'us',
			currentPlaybackTime: 0,
			currentPlaybackDuration: 56,
			playbackRate: 1,
			async authorize() {
				return 'capture-fixture';
			},
			async setQueue(options) {
				playing = false;
				instance.currentPlaybackTime = options.startTime ?? 0;
				timeChanged();
			},
			async play() {
				playing = true;
				emit('playbackStateDidChange', { state: states.playing });
				timeChanged();
			},
			pause() {
				playing = false;
				emit('playbackStateDidChange', { state: states.paused });
			},
			async stop() {
				playing = false;
				emit('playbackStateDidChange', { state: states.stopped });
			},
			async seekToTime(seconds) {
				instance.currentPlaybackTime = seconds;
				timeChanged();
			},
			addEventListener(name, handler) {
				if (!listeners.has(name)) listeners.set(name, new Set());
				listeners.get(name).add(handler);
			},
			removeEventListener(name, handler) {
				listeners.get(name)?.delete(handler);
			}
		};
		window.MusicKit = { configure: async () => instance, PlaybackStates: states };
		// Capture time, not wall time: encoding speed must not change a lyric's
		// position. Advance once per filmed frame (including every held frame).
		window.__shotAdvance = (seconds) => {
			if (playing) {
				instance.currentPlaybackTime = Math.min(
					56,
					instance.currentPlaybackTime + seconds * instance.playbackRate
				);
				timeChanged();
			}
		};
		window.__shotPlayback = () => ({
			time: instance.currentPlaybackTime,
			playing,
			rate: instance.playbackRate
		});
	});
}

/** Shared still/loop setup. Every timestamp is written through its real form. */
export async function preparePlayerScene(page, editor, { timed = true } = {}) {
	await editor.fill(playerTranscription);
	await page.getByRole('button', { name: 'Add audio source', exact: true }).click();
	const search = page.getByRole('searchbox', { name: 'Apple Music search' });
	if (!(await search.count())) {
		throw new Error(
			'Player capture needs an unexpired PUBLIC_APPLE_MUSIC_TOKEN in the server build. Use an isolated capture build with a fixture token; no Apple account is needed.'
		);
	}
	await search.fill(`https://music.apple.com/us/song/leave-the-radio-on/${playerSong.id}`);
	await search.press('Enter');
	await page.getByRole('dialog', { name: 'Add audio source' }).waitFor({ state: 'hidden' });
	await page.getByRole('tab', { name: 'Song', exact: true }).click();
	await page.getByRole('heading', { name: 'Song metadata' }).waitFor();
	// Let the pasted document's deferred lint results settle before editing
	// derived timing fields, as the other capture scenes do before their gestures.
	await page.waitForTimeout(2500);
	for (const [line, seconds] of timed ? playerLineTimes : []) {
		await page
			.locator('.cm-line')
			.nth(line - 1)
			.click();
		await page.getByRole('heading', { name: `Timing line ${line}`, exact: true }).waitFor();
		await page.getByRole('spinbutton', { name: 'Time in seconds' }).fill(String(seconds));
		await page.waitForFunction(
			(value) => document.querySelector('#current-line-time')?.value === String(value),
			seconds
		);
		await page.getByRole('button', { name: 'Set time', exact: true }).click();
		await page.locator(`.ll-time-value[data-anchor-seek="${seconds}"]`).waitFor();
	}
	await editor.focus();
	await page.keyboard.press('Control+Home');
	if (timed) {
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => window.__shotPlayback().playing);
		await page.evaluate(() => window.__shotAdvance(12));
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !window.__shotPlayback().playing);
	}
	await page.evaluate(() => {
		for (const element of document.querySelectorAll('.cm-scroller, .right-panel__body'))
			element.scrollTop = 0;
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await page.mouse.move(20, 20);
	await page.waitForTimeout(2000);
}
