/**
 * Whether this origin's storage bucket is protected from automatic eviction.
 *
 * Everything the workbench keeps — 'scribes, chats, preferences — lives in
 * IndexedDB, which is *best-effort* storage by default: a browser under disk
 * pressure may evict the whole bucket, silently and all at once. The Storage
 * API's `persist()` asks for the bucket to be marked persistent instead, and
 * how that ask behaves is the whole design here:
 *
 * - Chromium never prompts. It answers from engagement heuristics, and the
 *   Permissions API reports that answer without asking — so where the query
 *   already says `granted`, calling `persist()` is free and invisible, and the
 *   boot path does it silently.
 * - Firefox shows a real permission prompt. An uninvited prompt 250ms after the
 *   first keystroke is the touch-notice mistake with a dialog on it, so where
 *   the query says `prompt` — or cannot answer at all, which is how a browser
 *   without this permission name reads — nothing is asked until the user
 *   presses the control in the Preferences panel's Local data section. The
 *   press pays for the dialog, the same rule the YouTube opt-in follows.
 *
 * Module state for the same reason `rule-search.svelte.ts` is: the boot page
 * resolves it and the Preferences panel reads it, and the two have nothing to
 * hand each other. Component tests must therefore reset it
 * (`configureStoragePersistence()`), or one test's outcome is the next test's
 * boot state.
 */

type StoragePersistenceState = 'unknown' | 'unsupported' | 'persistent' | 'prompt' | 'denied';

export interface PersistentStorageApi {
	persisted(): Promise<boolean>;
	persist(): Promise<boolean>;
	permissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'>;
}

function browserApi(): PersistentStorageApi | undefined {
	if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
		return undefined;
	}
	const storage = navigator.storage;
	return {
		persisted: () => storage.persisted(),
		persist: () => storage.persist(),
		async permissionState() {
			try {
				const status = await navigator.permissions.query({
					name: 'persistent-storage' as PermissionName
				});
				return status.state;
			} catch {
				// A browser that cannot answer for this permission name is a browser
				// whose `persist()` behaviour we cannot predict — treated as `prompt`
				// by the caller, so any UI it might show follows a user's own press.
				return 'unknown';
			}
		}
	};
}

let state = $state<StoragePersistenceState>('unknown');
/** `null` marks the browser API as not yet resolved; `undefined` as absent. */
let api: PersistentStorageApi | undefined | null = null;

function resolveApi(): PersistentStorageApi | undefined {
	if (api === null) api = browserApi();
	return api;
}

export function storagePersistence(): StoragePersistenceState {
	return state;
}

/** Test seam: swap the storage API and return the state to its boot value. */
export function configureStoragePersistence(next?: PersistentStorageApi): void {
	api = next ?? null;
	state = 'unknown';
}

/**
 * Resolve the state at boot, taking the silent grant where there is one.
 * Never shows UI: the only `persist()` call here is behind a permission the
 * browser has already reported as granted.
 */
export async function ensurePersistentStorage(): Promise<void> {
	const impl = resolveApi();
	if (!impl) {
		state = 'unsupported';
		return;
	}
	try {
		if (await impl.persisted()) {
			state = 'persistent';
			return;
		}
		const permission = await impl.permissionState();
		if (permission === 'granted') {
			// Granted but not yet persisted is Chromium's heuristics having warmed
			// up since the last visit; flipping the bucket is invisible.
			state = (await impl.persist()) ? 'persistent' : 'denied';
			return;
		}
		if (permission === 'denied') {
			state = 'denied';
			return;
		}
		state = 'prompt';
	} catch {
		state = 'unknown';
	}
}

/** The explicit ask, spent from the Local data control — a press pays for any
 *  prompt the browser wants to show for it. */
export async function requestPersistentStorage(): Promise<boolean> {
	const impl = resolveApi();
	if (!impl) {
		state = 'unsupported';
		return false;
	}
	try {
		const granted = await impl.persist();
		state = granted ? 'persistent' : 'denied';
		return granted;
	} catch {
		state = 'denied';
		return false;
	}
}
