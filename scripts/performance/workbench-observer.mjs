/** Browser-only observation. No app state, timers or worker payloads are changed. */
export function installWorkbenchObserver() {
	const requests = new WeakMap();
	const pending = new Set();
	const completed = [];
	const errors = [];
	let operation;
	let editorReadyAt;
	let lastDiagnosticMutationAt = 0;
	let paintAfterLintAt = 0;
	let readyPaintScheduled = false;
	const OriginalWorker = globalThis.Worker;
	globalThis.Worker = class ObservedWorker extends OriginalWorker {
		constructor(...args) {
			super(...args);
			requests.set(this, []);
			this.addEventListener('error', (event) => errors.push(event.message || 'Worker error'));
			this.addEventListener('messageerror', () => errors.push('Worker message decoding failed'));
			this.addEventListener('message', (event) => {
				if (event.data === 'ready') return;
				const request = requests.get(this).shift();
				if (!request) return;
				pending.delete(request);
				if (request.procedure === 'lint') {
					completed.push({
						...request,
						receivedAt: performance.now(),
						responseType: event.data?.type
					});
					requestAnimationFrame(() =>
						requestAnimationFrame(() => {
							paintAfterLintAt = performance.now();
						})
					);
				}
			});
		}
		postMessage(message, ...options) {
			if (message && typeof message.procName === 'string' && Array.isArray(message.args)) {
				const request = { procedure: message.procName, sentAt: performance.now() };
				if (message.procName === 'lint') {
					try {
						request.text = JSON.parse(message.args[0].json);
					} catch {
						errors.push('Cannot identify Harper lint input');
					}
				}
				requests.get(this).push(request);
				pending.add(request);
			}
			return super.postMessage(message, ...options);
		}
	};
	document.addEventListener(
		'input',
		(event) => {
			if (operation && operation.startedAt === undefined && event.target.closest?.('.cm-content')) {
				operation.startedAt = performance.now();
			}
		},
		true
	);
	new MutationObserver((records) => {
		if (
			!editorReadyAt &&
			!readyPaintScheduled &&
			document.querySelector('.cm-content[contenteditable="true"]')
		) {
			readyPaintScheduled = true;
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					const editor = document.querySelector('.cm-content[contenteditable="true"]');
					if (editor?.getBoundingClientRect().height > 0) editorReadyAt = performance.now();
					readyPaintScheduled = false;
				})
			);
		}
		if (
			records.some((record) =>
				record.target.nodeType === 1
					? record.target.closest('.diagnostic-list') ||
						record.target.querySelector('.diagnostic-list')
					: record.target.parentElement?.closest('.diagnostic-list')
			)
		) {
			lastDiagnosticMutationAt = performance.now();
		}
	}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
	globalThis.workbenchAudit = {
		begin(expectedText, projectedText, nativeOffset, harperOffset) {
			operation = {
				expectedText,
				projectedText,
				nativeOffset,
				harperOffset,
				begunAt: performance.now()
			};
		},
		snapshot() {
			const latest = completed.findLast(
				(request) =>
					request.sentAt >= (operation?.begunAt ?? Infinity) &&
					request.text === operation.projectedText
			);
			const keys = Array.from(
				document.querySelectorAll('.diagnostic-list > li'),
				(row) => row.dataset.diagnosticKey
			);
			return {
				now: performance.now(),
				editorReadyAt,
				operation,
				nativePending: document.querySelector('.workspace')?.dataset.diagnosticsPending,
				keys,
				pending: pending.size,
				completedLint: latest,
				paintAfterLintAt,
				lastDiagnosticMutationAt,
				errors: [...errors]
			};
		}
	};
}

/** Also accepts plain snapshots so missing work and stale presentation can be tested in Node. */
export function workbenchSettled(snapshot) {
	const value = snapshot ?? globalThis.workbenchAudit.snapshot();
	if (value.errors.length) throw new Error(value.errors.join('; '));
	const { operation, completedLint } = value;
	return Boolean(
		operation &&
		Number.isFinite(operation.startedAt) &&
		value.nativePending === 'false' &&
		completedLint?.responseType === 'Array' &&
		completedLint.text === operation.projectedText &&
		value.pending === 0 &&
		value.keys.includes(
			`spelling.english-common:${operation.nativeOffset}:${operation.nativeOffset + 9}`
		) &&
		value.keys.includes(
			`spelling.harper:${operation.harperOffset}:${operation.harperOffset + 7}`
		) &&
		value.paintAfterLintAt > completedLint.receivedAt &&
		value.now - Math.max(completedLint.receivedAt, value.lastDiagnosticMutationAt) >= 100
	);
}
