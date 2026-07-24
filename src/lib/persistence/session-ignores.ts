import type { SessionIgnoreStore, SessionStorageLike } from './types.js';

const IGNORE_PREFIX = 'lyriclint:session-ignore:';

function draftPrefix(draftId: string): string {
	return `${IGNORE_PREFIX}${encodeURIComponent(draftId)}:`;
}

function ignoreKey(draftId: string, ruleId: string): string {
	return `${draftPrefix(draftId)}${encodeURIComponent(ruleId)}`;
}

/** Create session-scoped, draft-and-rule keyed ignore state. */
export function createSessionIgnoreStore(
	storage: SessionStorageLike = sessionStorage
): SessionIgnoreStore {
	return {
		isIgnored(draftId, ruleId) {
			return storage.getItem(ignoreKey(draftId, ruleId)) !== null;
		},

		ignore(draftId, ruleId) {
			storage.setItem(ignoreKey(draftId, ruleId), '1');
		},

		restore(draftId, ruleId) {
			storage.removeItem(ignoreKey(draftId, ruleId));
		},

		list(draftId) {
			const prefix = draftPrefix(draftId);
			const ruleIds: string[] = [];

			for (let index = 0; index < storage.length; index += 1) {
				const key = storage.key(index);
				if (key?.startsWith(prefix)) {
					ruleIds.push(decodeURIComponent(key.slice(prefix.length)));
				}
			}

			return ruleIds.sort();
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
