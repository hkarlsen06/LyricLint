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
	revision: number;
	draft: DraftRecord;
	generation: number;
	retainedFailure: boolean;
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
	const pending = new Map<string, PendingSave>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const latestRevision = new Map<string, number>();
	const generations = new Map<string, number>();
	let drainQueue = Promise.resolve();
	let isSaving = false;
	let lastSettledStatus: Extract<AutosaveStatus, 'idle' | 'saved'> = 'idle';
	let currentStatus: AutosaveStatus = 'idle';

	const setStatus = (status: AutosaveStatus) => {
		if (currentStatus !== status) {
			currentStatus = status;
			options.onStatusChange?.(status);
		}
	};

	const refreshStatus = () => {
		if (isSaving) {
			setStatus('saving');
		} else if ([...pending.values()].some((save) => !save.retainedFailure)) {
			setStatus('scheduled');
		} else if (pending.size > 0) {
			setStatus('failed');
		} else {
			setStatus(lastSettledStatus);
		}
	};

	const clearDraftTimer = (draftId: string) => {
		const timer = timers.get(draftId);
		if (timer !== undefined) {
			clearTimeout(timer);
			timers.delete(draftId);
		}
	};

	const clearAllTimers = () => {
		for (const timer of timers.values()) {
			clearTimeout(timer);
		}
		timers.clear();
	};

	const generationFor = (draftId: string) => generations.get(draftId) ?? 0;

	const drainOnce = async (draftId?: string): Promise<void> => {
		const attemptedOrders = new Set<number>();

		while (true) {
			const save = [...pending.values()]
				.filter(
					(candidate) =>
						(draftId === undefined || candidate.draft.id === draftId) &&
						!attemptedOrders.has(candidate.order)
				)
				.sort((left, right) => left.order - right.order)[0];

			if (save === undefined) {
				return;
			}

			attemptedOrders.add(save.order);
			const saveDraftId = save.draft.id;
			if (pending.get(saveDraftId) !== save) {
				continue;
			}

			pending.delete(saveDraftId);
			clearDraftTimer(saveDraftId);
			isSaving = true;
			refreshStatus();

			try {
				await repository.save(save.draft);
				if (generationFor(saveDraftId) === save.generation) {
					lastSettledStatus = 'saved';
				}
			} catch {
				const current = pending.get(saveDraftId);
				const sameGeneration = generationFor(saveDraftId) === save.generation;

				// A failed snapshot is retained only when no later accepted schedule
				// (and therefore no newer order/revision) exists for this draft.
				if (sameGeneration && current === undefined) {
					pending.set(saveDraftId, {
						...save,
						retainedFailure: true
					});
				}
			} finally {
				isSaving = false;
				refreshStatus();
			}
		}
	};

	const enqueueDrain = (draftId?: string): Promise<void> => {
		const drain = drainQueue.then(() => drainOnce(draftId));
		drainQueue = drain.catch(() => {});
		return drain;
	};

	return {
		schedule(snapshot) {
			const draftId = snapshot.draft.id;
			const existing = pending.get(draftId);
			const newestAcceptedRevision = latestRevision.get(draftId);

			/**
			 * Revisions are ordered only within a draft. A retained failed save may
			 * be replaced by any incoming revision, which treats that schedule as a
			 * new generation; otherwise lower revisions are ignored.
			 */
			if (
				existing?.retainedFailure !== true &&
				newestAcceptedRevision !== undefined &&
				snapshot.revision < newestAcceptedRevision
			) {
				return;
			}

			const order = ++nextOrder;
			latestRevision.set(draftId, snapshot.revision);
			pending.set(draftId, {
				order,
				revision: snapshot.revision,
				draft: copySnapshot(snapshot),
				generation: generationFor(draftId),
				retainedFailure: false
			});
			refreshStatus();

			clearDraftTimer(draftId);
			const timer = setTimeout(() => {
				if (timers.get(draftId) === timer) {
					timers.delete(draftId);
				}
				void enqueueDrain(draftId);
			}, debounceMs);
			timers.set(draftId, timer);
		},

		async flush() {
			clearAllTimers();
			await enqueueDrain();
		},

		cancel() {
			clearAllTimers();
			const knownDraftIds = new Set([
				...pending.keys(),
				...latestRevision.keys(),
				...generations.keys()
			]);
			pending.clear();
			latestRevision.clear();
			for (const draftId of knownDraftIds) {
				generations.set(draftId, generationFor(draftId) + 1);
			}
			lastSettledStatus = 'idle';
			refreshStatus();
		},

		cancelDraft(draftId) {
			clearDraftTimer(draftId);
			pending.delete(draftId);
			latestRevision.delete(draftId);
			generations.set(draftId, generationFor(draftId) + 1);
			if (pending.size === 0) {
				lastSettledStatus = 'idle';
			}
			refreshStatus();
		},

		status() {
			return currentStatus;
		}
	};
}
