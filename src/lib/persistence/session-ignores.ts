import type { SessionIgnoreStore, SessionStorageLike } from './types.js';

const IGNORE_PREFIX = 'lyriclint:session-ignore-diagnostic:';

function draftPrefix(draftId: string): string {
	return `${IGNORE_PREFIX}${encodeURIComponent(draftId)}:`;
}

function ignoreKey(draftId: string, diagnosticKey: string): string {
	return `${draftPrefix(draftId)}${encodeURIComponent(diagnosticKey)}`;
}

/** Create session-scoped, draft-and-diagnostic keyed ignore state. */
export function createSessionIgnoreStore(
	storage: SessionStorageLike = sessionStorage
): SessionIgnoreStore {
	return {
		isIgnored(draftId, diagnosticKey) {
			return storage.getItem(ignoreKey(draftId, diagnosticKey)) !== null;
		},

		ignore(draftId, diagnosticKey) {
			storage.setItem(ignoreKey(draftId, diagnosticKey), '1');
		},

		restore(draftId, diagnosticKey) {
			storage.removeItem(ignoreKey(draftId, diagnosticKey));
		},

		list(draftId) {
			const prefix = draftPrefix(draftId);
			const diagnosticKeys: string[] = [];

			for (let index = 0; index < storage.length; index += 1) {
				const key = storage.key(index);
				if (key?.startsWith(prefix)) {
					diagnosticKeys.push(decodeURIComponent(key.slice(prefix.length)));
				}
			}

			return diagnosticKeys.sort();
		},

		clearDraft(draftId) {
			const prefix = draftPrefix(draftId);
			const keys: string[] = [];

			for (let index = 0; index < storage.length; index += 1) {
				const key = storage.key(index);
				if (key?.startsWith(prefix)) {
					keys.push(key);
				}
			}

			for (const key of keys) {
				storage.removeItem(key);
			}
		}
	};
}
