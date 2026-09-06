/** Derive the phone hero loop from the current generated scene without re-filming.
 * node scripts/render-mobile-loop.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { writeShotDimensions } from './write-shot-dimensions.mjs';

const run = promisify(execFile);
export async function renderMobileLoop() {
	await run('ffmpeg', [
		'-y',
		'-i',
		'static/workbench.webm',
		'-vf',
		'scale=1280:-2:flags=lanczos',
		'-c:v',
		'libvpx-vp9',
		'-pix_fmt',
		'yuv420p',
		'-crf',
		'30',
		'-b:v',
		'0',
		'-row-mt',
		'1',
		'-cpu-used',
		'2',
		'-an',
		'static/workbench-mobile.webm'
	]);
	await writeShotDimensions();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await renderMobileLoop();
}
