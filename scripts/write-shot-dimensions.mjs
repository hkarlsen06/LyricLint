/** Decision record: docs/subsystems/site.md
 * Refresh the landing page's intrinsic sizes from encoded assets, not crop estimates.
 * node scripts/write-shot-dimensions.mjs also refreshes existing captures without filming.
 */
import { execFile } from 'node:child_process';
import { readdir, writeFile, rename } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const destination = 'src/lib/assets/shot-dimensions.json';

export async function writeShotDimensions() {
	const files = (await readdir('static'))
		.filter((name) => /^workbench(?:-[\w-]+)?\.(webp|webm)$/.test(name))
		.sort();
	const entries = await Promise.all(
		files.map(async (name) => {
			const { stdout } = await run('ffprobe', [
				'-v',
				'error',
				'-select_streams',
				'v:0',
				'-show_entries',
				'stream=width,height',
				'-of',
				'json',
				`static/${name}`
			]);
			const { width, height } = JSON.parse(stdout).streams[0] ?? {};
			if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
				throw new Error(`No valid dimensions in ${name}`);
			}
			return [name, { width, height }];
		})
	);
	// Readers see either complete manifest, including if several captures finish together.
	const temporary = `${destination}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(Object.fromEntries(entries), null, '\t')}\n`);
	await rename(temporary, destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await writeShotDimensions();
}
