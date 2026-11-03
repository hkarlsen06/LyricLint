import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Capture workers before they run. Nested CDP sessions keep worker profiling explicit. */
export async function startWorkbenchProfiler(context, page) {
	const cdp = await context.newCDPSession(page);
	const workers = new Map();
	const pending = new Map();
	const errors = [];
	let nextId = 1;
	const send = (sessionId, method) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`Worker profiler timed out: ${method}`));
			}, 15_000);
			pending.set(id, { resolve, reject, timer });
			void cdp
				.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method }) })
				.catch((error) => {
					clearTimeout(timer);
					pending.delete(id);
					reject(error);
				});
		});
	cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
		const response = JSON.parse(message);
		if (response.method === 'Runtime.exceptionThrown')
			errors.push(JSON.stringify(response.params.exceptionDetails));
		if (!pending.has(response.id)) return;
		const request = pending.get(response.id);
		clearTimeout(request.timer);
		pending.delete(response.id);
		if (response.error) request.reject(new Error(response.error.message));
		else request.resolve(response.result);
	});
	cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
		if (targetInfo.type !== 'worker') return;
		const initialized = (async () => {
			await send(sessionId, 'Runtime.enable');
			await send(sessionId, 'Profiler.enable');
			await send(sessionId, 'Profiler.start');
			await send(sessionId, 'Runtime.runIfWaitingForDebugger');
		})();
		workers.set(sessionId, { targetInfo, initialized });
		void initialized.catch((error) => errors.push(error.message));
	});
	await cdp.send('Target.setAutoAttach', {
		autoAttach: true,
		waitForDebuggerOnStart: true,
		flatten: false
	});
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.start');
	return {
		async stop(directory) {
			const main = await cdp.send('Profiler.stop');
			if (!workers.size)
				throw new Error('No worker CPU target was captured; refusing a main-only profile.');
			const profiles = [{ target: 'main', profile: main.profile }];
			for (const [sessionId, worker] of workers) {
				await worker.initialized;
				const result = await send(sessionId, 'Profiler.stop');
				profiles.push({
					target: `worker-${profiles.length}`,
					url: worker.targetInfo.url,
					profile: result.profile
				});
			}
			if (errors.length) throw new Error(errors.join('; '));
			for (const { target, profile } of profiles) {
				await writeFile(join(directory, `${target}.cpuprofile`), JSON.stringify(profile));
			}
			await cdp.detach();
			return profiles.map(({ target, url, profile }) => ({
				target,
				url,
				...summarizeWorkbenchProfile(profile)
			}));
		},
		async dispose() {
			for (const request of pending.values()) {
				clearTimeout(request.timer);
				request.reject(new Error('Worker profiler disposed'));
			}
			pending.clear();
			await cdp.detach().catch(() => {});
		}
	};
}

export function summarizeWorkbenchProfile(profile) {
	const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
	const times = new Map();
	let sampledActiveMs = 0;
	for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
		const frame = nodes.get(profile.samples[index]);
		if (!frame || ['(idle)', '(program)', '(root)'].includes(frame.functionName)) continue;
		const ms = profile.timeDeltas[index] / 1000;
		sampledActiveMs += ms;
		const key = JSON.stringify([frame.functionName, frame.url, frame.lineNumber + 1]);
		times.set(key, (times.get(key) ?? 0) + ms);
	}
	return {
		sampledActiveMs,
		topSelfCpu: [...times]
			.sort((left, right) => right[1] - left[1])
			.slice(0, 10)
			.map(([key, ms]) => {
				const [name, url, line] = JSON.parse(key);
				return { name, url, line, sampledSelfMs: ms };
			})
	};
}
