/** Derive the phone hero loop from the current generated scene without re-filming.
 * node scripts/render-mobile-loop.mjs
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { writeShotDimensions } from './write-shot-dimensions.mjs';

const run = promisify(execFile);
export async function renderMobileLoop() {
	const source = 'static/workbench.webm';
	const { stdout } = await run('ffprobe', [
		'-v',
		'error',
		'-select_streams',
		'v:0',
		'-show_entries',
		'stream=r_frame_rate:format=duration:format_tags=LYRICLINT_ACCELERATED_START_FRAME,LYRICLINT_ACCELERATED_END_FRAME',
		'-of',
		'json',
		source
	]);
	const { streams, format } = JSON.parse(stdout);
	const [numerator, denominator] = (streams[0]?.r_frame_rate ?? '').split('/').map(Number);
	const fps = numerator / denominator;
	const frames = Math.round(Number(format.duration) * fps);
	const start = Number(format.tags?.LYRICLINT_ACCELERATED_START_FRAME);
	const end = Number(format.tags?.LYRICLINT_ACCELERATED_END_FRAME);
	if (
		!Number.isFinite(fps) ||
		fps <= 0 ||
		![frames, start, end].every(Number.isInteger) ||
		start <= 0 ||
		end <= start ||
		end >= frames
	) {
		throw new Error('The hero needs valid accelerated-frame metadata; regenerate it with --hero.');
	}

	// Keep the original quality for clear text. Re-encoding the whole movie at
	// CRF 30 spent most phone bytes on the accelerated grain even after the master
	// had compressed it. The master carries its boundaries so standalone refreshes
	// use exactly the same sections as a fresh capture, without a second timing list.
	// The final rename stays atomic even when the system temp directory is on
	// another filesystem. The old generated asset survives a refused encode.
	const directory = await mkdtemp('static/.workbench-mobile-');
	try {
		const segments = [
			[0, start],
			[start, end],
			[end, frames]
		];
		for (const [index, [from, to]] of segments.entries()) {
			await run('ffmpeg', [
				'-y',
				'-i',
				source,
				'-vf',
				`trim=start_frame=${from}:end_frame=${to},setpts=PTS-STARTPTS,scale=1280:-2:flags=lanczos`,
				'-fps_mode',
				'passthrough',
				'-c:v',
				'libvpx-vp9',
				'-pix_fmt',
				'yuv420p',
				'-crf',
				index === 1 ? '50' : '30',
				'-b:v',
				'0',
				// UI holds need fewer full frames; keep seeking bounded to ten seconds.
				'-g',
				String(Math.round(fps * 10)),
				'-row-mt',
				'1',
				'-cpu-used',
				'2',
				'-an',
				join(directory, `part-${index}.webm`)
			]);
		}
		const list = join(directory, 'parts.txt');
		const output = join(directory, 'workbench-mobile.webm');
		await writeFile(list, segments.map((_, index) => `file 'part-${index}.webm'`).join('\n'));
		// WebM rounds segment timestamps to milliseconds. Re-establish the capture's
		// frame cadence after concatenation so boundary frames never share a timestamp.
		await run('ffmpeg', [
			'-y',
			'-f',
			'concat',
			'-safe',
			'0',
			'-i',
			list,
			'-c',
			'copy',
			'-bsf:v',
			`setts=ts=N/(${fps}*TB)`,
			output
		]);
		await rename(output, 'static/workbench-mobile.webm');
		await writeShotDimensions();
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await renderMobileLoop();
}
