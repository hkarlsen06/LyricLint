/** Decision record: docs/subsystems/site.md
 * Build once, capture against an owned preview server, and always close it.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const captures = [
	['render:social'],
	['render:workbench'],
	['render:workbench', '--performers'],
	['render:workbench', '--harper'],
	['render:motion'],
	['render:motion', '--harper'],
	['render:motion', '--hero']
];

function runCommand(args, env, signal) {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const grouped = process.platform !== 'win32';
		const child = spawn('bun', ['run', ...args], {
			cwd: root,
			env,
			stdio: 'inherit',
			detached: grouped
		});
		let killTimer;
		const kill = (kind) => {
			if (!child.pid) return;
			try {
				if (grouped) process.kill(-child.pid, kind);
				else child.kill(kind);
			} catch (error) {
				if (error.code !== 'ESRCH') throw error;
			}
		};
		const stop = () => {
			kill('SIGTERM');
			killTimer = setTimeout(() => kill('SIGKILL'), 5000);
			killTimer.unref();
		};
		const cleanup = () => {
			clearTimeout(killTimer);
			signal.removeEventListener('abort', stop);
		};
		signal.addEventListener('abort', stop, { once: true });
		child.once('error', (error) => {
			cleanup();
			reject(error);
		});
		child.once('exit', (code, reason) => {
			cleanup();
			if (code === 0 && !signal.aborted) resolve();
			else reject(new Error(`bun run ${args.join(' ')} failed (${reason ?? code})`));
		});
	});
}

export async function renderAll({ run = runCommand, startPreview = preview } = {}) {
	const controller = new AbortController();
	const interrupt = () => controller.abort(new Error('Rendering interrupted'));
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', interrupt);
	let server;
	try {
		await run(['build'], process.env, controller.signal);
		controller.signal.throwIfAborted();
		server = await startPreview({
			root,
			// An ephemeral loopback port cannot take over an existing dev server.
			// Explicit HTTP also avoids inheriting local development certificates.
			preview: { host: '127.0.0.1', port: 0, open: false, https: false }
		});
		controller.signal.throwIfAborted();
		const { port } = server.httpServer.address();
		const origin = `http://127.0.0.1:${port}`;
		console.log(`Rendering against ${origin}`);
		for (const args of captures) {
			controller.signal.throwIfAborted();
			await run(args, { ...process.env, ORIGIN: origin }, controller.signal);
		}
	} finally {
		if (server) {
			await new Promise((resolve, reject) => {
				server.httpServer.close((error) => (error ? reject(error) : resolve()));
				server.httpServer.closeAllConnections();
			});
		}
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		await renderAll();
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
