/**
 * City Lights, used with its author's permission for the transcription demo.
 * The real lyrics and YouTube artwork live in fixtures/; only the provider clock
 * is simulated. All document, attachment, transport, review and linking changes
 * go through the workbench's controls. Nothing here enters the deployed app.
 */
import { readFile } from 'node:fs/promises';

export const heroSong = JSON.parse(
	await readFile(new URL('./fixtures/city-lights.json', import.meta.url), 'utf8')
);
const tutorial = JSON.parse(
	await readFile(new URL('../src/lib/assets/hero-tutorial.json', import.meta.url), 'utf8')
);

export const heroVideoUrl = `https://www.youtube.com/watch?v=${heroSong.videoId}`;

// Ordinary transcription mistakes, corrected on camera. The reference remains
// verbatim; a spelling fix must never rewrite the second chorus's extra ad-libs.
export const heroDraft = heroSong.lyrics
	.replace('[Verse 1]', 'Verse 1:')
	.replaceAll('heartbeat', 'heartbeet');

/** Install in a fresh capture page, before navigation. No live Google requests. */
export async function installHeroScene(page) {
	const artwork = await readFile(new URL('./fixtures/city-lights.jpg', import.meta.url));
	await page.route(`https://i.ytimg.com/vi/${heroSong.videoId}/*`, (route) =>
		route.fulfill({ contentType: 'image/jpeg', body: artwork })
	);
	await page.route('https://www.youtube.com/**', (route) => route.abort());
	await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
	await page.addInitScript((song) => {
		let advance = () => {};
		let playback = () => ({ time: 0, playing: false });
		const states = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
		window.YT = {
			PlayerState: states,
			Player: class {
				time = 0;
				rate = 1;
				playing = false;
				constructor(host, options) {
					if (options.videoId !== song.videoId) throw new Error('Unexpected hero video');
					advance = (seconds) => this.advance(seconds);
					playback = () => ({ time: this.time, playing: this.playing });
					this.host = host;
					this.events = options.events;
					const image = document.createElement('img');
					image.src = `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`;
					image.alt = `${song.title} by ${song.artist}`;
					image.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain';
					host.append(image);
					queueMicrotask(() => this.events.onReady());
				}
				playVideo() {
					this.playing = true;
					this.events.onStateChange({ data: states.PLAYING });
				}
				pauseVideo() {
					this.playing = false;
					this.events.onStateChange({ data: states.PAUSED });
				}
				seekTo(seconds) {
					this.time = Math.max(0, Math.min(song.duration, seconds));
				}
				getCurrentTime() {
					return this.time;
				}
				getDuration() {
					return song.duration;
				}
				getAvailablePlaybackRates() {
					return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
				}
				setPlaybackRate(rate) {
					this.rate = rate;
				}
				getVideoData() {
					return { title: song.title };
				}
				cueVideoById({ videoId, startSeconds = 0 }) {
					if (videoId !== song.videoId) throw new Error('Unexpected hero video');
					this.time = startSeconds;
					this.playing = false;
				}
				advance(seconds) {
					if (!this.playing) return;
					this.time = Math.min(song.duration, this.time + seconds * this.rate);
					if (this.time === song.duration) {
						this.playing = false;
						this.events.onStateChange({ data: states.ENDED });
					}
				}
				destroy() {
					this.host.remove();
					advance = () => {};
					playback = () => ({ time: 0, playing: false });
				}
			}
		};
		window.__shotAdvance = (seconds) => advance(seconds);
		window.__shotPlayback = () => playback();
	}, heroSong);
}

/** A populated frame from the same song, useful before motion and without it. */
export async function prepareHeroScene(page, editor) {
	await page.getByRole('button', { name: 'Add audio source', exact: true }).click();
	await page.getByRole('textbox', { name: 'YouTube link' }).fill(heroVideoUrl);
	await page.getByRole('button', { name: 'Use video', exact: true }).click();
	await page.getByRole('slider', { name: 'Seek' }).waitFor({ state: 'visible' });
	await editor.fill(heroDraft);
	await editor.press('Control+Home');
	await page.waitForTimeout(2500);
	await page.getByRole('tab', { name: /^Review/ }).click();
	const leading = page.locator('.diagnostic-list__navigate').first();
	if ((await leading.getAttribute('aria-expanded')) !== 'true') await leading.click();
	await page.evaluate(() => document.activeElement?.blur());
}

/** Read the document, not preview decorations or CodeMirror's virtualized rows. */
async function lyrics(page) {
	return page.evaluate(() => {
		const content = document.querySelector('.cm-content');
		return (content.cmView ?? content.cmTile).view.state.doc.toString();
	});
}

/** The authored sequence; the renderer owns the camera, cursor and film clock. */
export async function filmHeroScene({
	page,
	editor,
	hold,
	glide,
	clickHere,
	pressKey,
	setSpeed,
	getTime,
	restPosition
}) {
	const cues = heroSong.lineTimes;
	const playback = () => page.evaluate(() => window.__shotPlayback());
	const wait = (seconds) => hold(Math.round(seconds * 20));
	// The written script owns the clock. Refuse a late action rather than silently
	// stretching the film away from its captions when a gesture changes.
	const until = async (seconds, label) => {
		if (getTime() > seconds + 0.1) {
			throw new Error(`${label} missed its narration cue: ${getTime().toFixed(2)} > ${seconds}`);
		}
		await hold(Math.max(0, Math.ceil((seconds - getTime()) * 20)));
	};
	const at = async (id, action) => {
		const step = tutorial.steps.find((step) => step.id === id);
		const seconds = action ? step?.actions[action] : step?.start;
		if (!Number.isFinite(seconds)) throw new Error(`Missing tutorial cue: ${id}.${action}`);
		await until(seconds, `${id}.${action ?? 'start'}`);
		console.log(`hero: ${id}.${action ?? 'start'} at ${getTime().toFixed(2)}s`);
	};
	const settle = async () => {
		await page.clock.runFor(2000);
		// The proofreader runs in a worker, outside Playwright's page clock.
		await page.waitForTimeout(300);
	};
	const click = async (locator, readFor = 0.1, after = 0.1) => {
		await locator.waitFor({ state: 'visible' });
		const box = await locator.boundingBox();
		if (!box) throw new Error('A filmed control has no visible bounds');
		await glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, 6);
		await wait(readFor);
		await clickHere(0, true);
		await wait(after);
	};
	const type = async (text) => {
		for (const [index, letter] of [...text].entries()) {
			if (letter === '\n') await page.keyboard.press('Enter');
			else await page.keyboard.insertText(letter);
			await hold(letter === ' ' ? 1 : index % 3 === 0 ? 3 : 2);
		}
	};
	const expectLyrics = async (expected, label) => {
		const actual = await lyrics(page);
		if (actual !== expected) {
			throw new Error(`${label}: unexpected lyrics\n${JSON.stringify(actual)}`);
		}
	};

	await expectLyrics('', 'Opening');
	await at('import', 'open');
	await click(page.getByRole('button', { name: 'Add audio source', exact: true }));
	const url = page.getByRole('textbox', { name: 'YouTube link' });
	await click(url, 0.1, 0);
	await page.evaluate((value) => navigator.clipboard.writeText(value), heroVideoUrl);
	await at('import', 'paste');
	await pressKey('Control+V', 'Ctrl V', 'Paste song link');
	await wait(0.65);
	if ((await url.inputValue()) !== heroVideoUrl) throw new Error('The song link was not pasted');
	await at('import', 'attach');
	await click(page.getByRole('button', { name: 'Use video', exact: true }), 0.1, 0.25);
	const seek = page.getByRole('slider', { name: 'Seek', exact: true });
	await seek.waitFor({ state: 'visible' });
	await page.locator('.media-video img').evaluate((image) => image.decode());

	await click(editor, 0, 0);
	await type('Verse 1:\n');
	await at('listen', 'play');
	await pressKey('Escape', 'Esc', 'Listen');
	if (!(await playback()).playing) throw new Error('Escape did not start the song');
	await at('type', 'pause');
	await pressKey('Escape', 'Esc', 'Pause');
	if ((await playback()).playing) throw new Error('Escape did not pause the song');
	await at('type', 'type');
	await type('Under city lights');
	await wait(0.4);
	await at('replay', 'play');
	const pausedAt = (await playback()).time;
	await pressKey('Escape', 'Esc', 'Replay · back 2s');
	const replay = await playback();
	if (!replay.playing || Math.abs(replay.time - (pausedAt - 2)) > 0.01) {
		throw new Error(`Resume did not rewind two seconds: ${pausedAt} → ${replay.time}`);
	}
	await at('replay', 'pause');
	await pressKey('Escape', 'Esc', 'Pause');
	await at('replay', 'type');
	await type(' we walk');
	await wait(0.4);
	const opening = 'Verse 1:\nUnder city lights we walk';
	await expectLyrics(opening, 'Opening phrase');
	console.log('hero: listened, typed and replayed the opening phrase');

	// Accelerated typing still goes through normal text input. Never replace the
	// entire document midway: that would erase the history this film has created.
	await at('accelerate', 'start');
	await pressKey('Escape', 'Esc', 'Continue transcribing');
	const speed = 24;
	setSpeed(speed);
	const lines = heroDraft.split('\n');
	for (let index = 2; index < lines.length; index += 1) {
		await page.keyboard.press('Enter');
		const line = lines[index];
		const cueIndex = cues.findIndex((cue) => cue.line === index + 1);
		if (cueIndex === -1) {
			if (line) await page.keyboard.insertText(line);
			continue;
		}
		const cue = cues[cueIndex];
		while ((await playback()).time < cue.seconds) await hold(1);
		// The accelerated pass spends the script’s allotted time on the remaining song. Spread the typing
		// over its sung phrase, leaving the instrumental break visibly untapped.
		// The final line gets four seconds; no end-of-vocal timestamp was supplied.
		const end = Math.min(cues[cueIndex + 1]?.seconds ?? cue.seconds + 4, cue.seconds + 6);
		const beats = Math.max(1, Math.ceil(((end - (await playback()).time) * 20) / speed));
		for (let beat = 0; beat < beats; beat += 1) {
			await page.keyboard.insertText(
				line.slice(
					Math.round((beat * line.length) / beats),
					Math.round(((beat + 1) * line.length) / beats)
				)
			);
			await hold(1);
		}
	}
	await at('accelerate', 'end');
	setSpeed(1);
	if ((await playback()).playing) await pressKey('Escape', 'Esc', 'Review');
	await settle();
	await expectLyrics(heroDraft, 'Accelerated transcription');
	await at('header', 'open');
	await editor.focus();
	await pressKey('Control+Home', 'Ctrl Home', 'Review from the top');
	await wait(0.4);
	const leading = page.locator('.diagnostic-list__navigate').first();
	if ((await leading.getAttribute('aria-expanded')) !== 'true') await click(leading);
	await at('header', 'fix');
	await click(page.getByRole('button', { name: 'Use [Verse 1]', exact: true }));
	await at('link', 'open');
	await click(page.getByRole('button', { name: 'Manage linking', exact: true }));
	await at('link', 'select');
	const secondChorus = page.getByRole('checkbox', { name: /^Chorus 2/ });
	if (!(await secondChorus.isChecked())) await click(secondChorus);
	const beforeLink = await lyrics(page);
	await at('link', 'link');
	await click(page.getByRole('button', { name: 'Link 2 sections', exact: true }));
	await expectLyrics(beforeLink, 'Linking preserves both choruses');
	await at('link', 'review');
	await click(page.getByRole('tab', { name: /^Review/ }));
	await settle();

	const showOtherChorus = async () => {
		await editor.focus();
		await page.keyboard.press('Control+End');
		const editorBox = await page.locator('.editor-region').boundingBox();
		await glide({ x: editorBox.x + 80, y: editorBox.y + 120 }, 8);
		// End brings the caret into view, but the floating source can still cover
		// the right half of a lyric. Spend the editor's real bottom scroll padding.
		await page.mouse.wheel(0, 600);
		await wait(0.2);
		const adlib = page
			.locator('.cm-line')
			.filter({ hasText: 'heartbeat (Echoing through the city)' });
		if (!(await adlib.isVisible()))
			throw new Error('The other chorus’s preserved ad-lib is not visible');
		const box = await adlib.boundingBox();
		const picture = await page.locator('.workspace-video').boundingBox();
		if (box.y < editorBox.y || box.y + box.height > picture.y) {
			throw new Error('The preserved ad-lib is obscured by the floating song video');
		}
		await glide({ x: box.x + box.width * 0.75, y: box.y + box.height / 2 }, 8);
	};
	for (const [id, remaining] of [
		['typo', 2],
		['adlibs', 0]
	]) {
		await at(id, 'fix');
		await click(page.getByRole('button', { name: 'Replace with heartbeat', exact: true }));
		await settle();
		if ((await lyrics(page)).split('heartbeet').length - 1 !== remaining) {
			throw new Error('The spelling correction did not mirror to the other chorus');
		}
		await at(id, 'show');
		await showOtherChorus();
	}
	await expectLyrics(heroSong.lyrics, 'Finished transcription');
	if ((await page.locator('.diagnostic-list > li').count()) !== 0) {
		throw new Error('The finished transcription still has findings');
	}
	console.log('hero: linked choruses, mirrored both fixes, preserved the original lyrics');
	await at('copy', 'home');
	await editor.focus();
	await pressKey('Control+Home', 'Ctrl Home', 'Back to the opening');
	await page.evaluate(() => document.activeElement?.blur());
	await glide(restPosition, 8);
	await at('copy', 'copy');
	await click(page.getByRole('button', { name: 'Copy lyrics', exact: true }));
	if ((await page.evaluate(() => navigator.clipboard.readText())) !== heroSong.lyrics) {
		throw new Error('The finished lyrics did not reach the clipboard intact');
	}
	await glide(restPosition, 8);
	await until(tutorial.duration, 'Finished hold');
	console.log('hero: copied the exact finished lyrics; narration timeline complete');
}
