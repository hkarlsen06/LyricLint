import type {
	AutosaveController,
	AutosaveOptions,
	AutosaveSnapshot,
	AutosaveStatus,
	DraftRecord,
	DraftRepository
} from './types.js';

const DEFAULT_DEBOUNCE_MS = 250;

interface PendingSave {
	order: number;
	draft: DraftRecord;
}

function copySnapshot(snapshot: AutosaveSnapshot): DraftRecord {
	const { draft } = snapshot;
	const copy: DraftRecord = {
		id: draft.id,
		title: draft.title,
		text: draft.text,
		language: draft.language,
		performers: draft.performers.map((performer) => ({
			id: performer.id,
			displayName: performer.displayName,
			normalizedKey: performer.normalizedKey,
			aliases: [...performer.aliases],
			colorId: performer.colorId,
			order: performer.order
		})),
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt,
		ruleSetVersion: draft.ruleSetVersion
	};

	if (draft.originalText !== undefined) {
		copy.originalText = draft.originalText;
	}

	if (draft.editorSelection !== undefined) {
		copy.editorSelection = {
			anchor: draft.editorSelection.anchor,
			head: draft.editorSelection.head
		};
	}

	return copy;
}

/**
 * Create a debounced local autosave controller.
 *
 * Writes are serialized. If a newer snapshot arrives while an older write is
 * in flight, the newer write runs after it, so the older completion cannot
 * become the final durable state.
 */
export function createAutosaveController(
	repository: DraftRepository,
	options: AutosaveOptions = {}
): AutosaveController {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	let nextOrder = 0;
	let newestOrder = 0;
	let pending: PendingSave | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let active: Promise<void> | undefined;
	let currentStatus: AutosaveStatus = 'idle';

	const clearTimer = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	const drain = (): Promise<void> => {
		if (active !== undefined) {
			return active;
		}

		active = (async () => {
			while (pending !== undefined) {
				const save = pending;
				pending = undefined;
				currentStatus = 'saving';

				try {
					await repository.save(save.draft);
					if (save.order === newestOrder && pending === undefined) {
						currentStatus = 'saved';
					}
				} catch {
					if (save.order === newestOrder && pending === undefined) {
						currentStatus = 'failed';
					}
				}
			}
		})().finally(() => {
			active = undefined;
			if (pending === undefined && currentStatus === 'saving') {
				currentStatus = 'idle';
			}
		});

		return active;
	};

	return {
		schedule(snapshot) {
			const order = ++nextOrder;
			newestOrder = order;
			pending = {
				order,
				draft: copySnapshot(snapshot)
			};
			currentStatus = 'scheduled';
			clearTimer();
			timer = setTimeout(() => {
				timer = undefined;
				void drain();
			}, debounceMs);
		},

		async flush() {
			do {
				clearTimer();
				await drain();
			} while (pending !== undefined);
		},

		cancel() {
			clearTimer();
			pending = undefined;
			newestOrder = ++nextOrder;
			if (active === undefined) {
				currentStatus = 'idle';
			}
		},

		status() {
			return currentStatus;
		}
	};
}
