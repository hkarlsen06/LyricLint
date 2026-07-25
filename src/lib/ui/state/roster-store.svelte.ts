import type {
	EditorSnapshot,
	ImportSuggestion,
	PerformerRecord,
	VoiceGroup
} from '$lib/core/types.js';
import { extractPerformers } from '$lib/performers/index.js';
import { SvelteMap } from 'svelte/reactivity';
import type { FeedbackState } from './feedback.svelte.js';

export interface RosterMergeSuggestion {
	sourceId: string;
	targetId: string;
	sourceName: string;
	targetName: string;
	reason: 'case' | 'normalized-key' | 'alias';
}

/**
 * Roster allocation order for performer colors. Green then violet lead so the
 * first two performers match the approved mockup (Mara green, Jun violet);
 * the remaining hues stay mutually distinguishable.
 */
export const performerColorIds = [
	'olive',
	'indigo',
	'teal',
	'ochre',
	'rose',
	'plum',
	'copper',
	'slate'
] as const;

export function cloneRoster(roster: readonly PerformerRecord[]): PerformerRecord[] {
	return roster.map((performer) => ({ ...performer, aliases: [...performer.aliases] }));
}

function normalizedKey(displayName: string): string {
	return displayName.trim().toLocaleLowerCase();
}

export interface RosterStoreDependencies {
	initialPerformers: readonly PerformerRecord[];
	feedback: FeedbackState;
	idFactory: () => string;
	scheduleSave: () => void;
}

export interface RosterStore {
	readonly performers: readonly PerformerRecord[];
	readonly suggestions: readonly RosterMergeSuggestion[];
	readonly unresolvedVoiceGroups: readonly VoiceGroup[];
	/** Adopt a stored roster without marking the draft dirty. */
	reset(roster: readonly PerformerRecord[]): void;
	importFromSnapshot(snapshot: EditorSnapshot): void;
	addPerformer(displayName: string): void;
	renamePerformer(id: string, displayName: string): void;
	adoptHeaderRename(id: string, previousName: string, displayName: string): void;
	mergePerformers(sourceId: string, targetId: string): void;
	removePerformer(id: string): void;
}

export function createRosterStore(deps: RosterStoreDependencies): RosterStore {
	let performers = $state<PerformerRecord[]>(cloneRoster(deps.initialPerformers));
	let importSuggestions = $state<ImportSuggestion[]>([]);
	let unresolvedVoiceGroups = $state<VoiceGroup[]>([]);

	const feedback = deps.feedback;

	function setRoster(next: readonly PerformerRecord[]): void {
		performers = next
			.map((performer, index) => ({ ...performer, aliases: [...performer.aliases], order: index }))
			.sort((left, right) => left.order - right.order);
		deps.scheduleSave();
	}

	function commitRoster(next: readonly PerformerRecord[], message: string): void {
		const previous = cloneRoster(performers);
		setRoster(next);
		feedback.announce(message);
		feedback.addToast({
			message,
			actionLabel: 'Undo',
			action: () => {
				setRoster(previous);
				feedback.announce('Roster change undone.');
			}
		});
	}

	return {
		get performers() {
			return performers;
		},
		get suggestions() {
			const suggestions = new SvelteMap<string, RosterMergeSuggestion>();
			for (let sourceIndex = 0; sourceIndex < performers.length; sourceIndex += 1) {
				for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex += 1) {
					const source = performers[sourceIndex];
					const target = performers[targetIndex];
					if (!source || !target || source.normalizedKey !== target.normalizedKey) continue;
					const suggestion: RosterMergeSuggestion = {
						sourceId: source.id,
						targetId: target.id,
						sourceName: source.displayName,
						targetName: target.displayName,
						reason:
							source.displayName.toLocaleLowerCase() === target.displayName.toLocaleLowerCase()
								? 'case'
								: 'normalized-key'
					};
					suggestions.set(`${suggestion.sourceId}:${suggestion.targetId}`, suggestion);
				}
			}
			for (const imported of importSuggestions) {
				const source = performers.find(
					(performer) =>
						performer.displayName === imported.importedName && performer.id !== imported.performerId
				);
				const target = performers.find((performer) => performer.id === imported.performerId);
				if (!source || !target) continue;
				const suggestion: RosterMergeSuggestion = {
					sourceId: source.id,
					targetId: target.id,
					sourceName: source.displayName,
					targetName: target.displayName,
					reason: imported.reason
				};
				suggestions.set(`${suggestion.sourceId}:${suggestion.targetId}`, suggestion);
			}
			return [...suggestions.values()];
		},
		get unresolvedVoiceGroups() {
			return unresolvedVoiceGroups;
		},
		reset(roster) {
			performers = cloneRoster(roster);
		},
		importFromSnapshot(snapshot) {
			const extraction = extractPerformers(snapshot.parsed, performers);
			importSuggestions = extraction.suggestions.map((suggestion) => ({
				...suggestion,
				importedRange: { ...suggestion.importedRange }
			}));
			// One entry per distinct voice identity. Extraction emits an unresolved
			// group per section that styles the slot, and they share an id: the
			// identity key is derived from performer IDs alone, and every section
			// reuses the same `Unresolved voice N` performer. The panel renders one
			// indistinguishable row per entry, so the duplicates were both visual
			// noise and a collision in its keyed each.
			const distinctUnresolved = new SvelteMap<string, VoiceGroup>();
			for (const group of extraction.unresolvedVoiceGroups) {
				distinctUnresolved.set(`${group.styleSlot}-${group.id}`, {
					...group,
					performerIds: [...group.performerIds],
					...(group.sourceRange ? { sourceRange: { ...group.sourceRange } } : {})
				});
			}
			unresolvedVoiceGroups = [...distinctUnresolved.values()];

			if (extraction.rosterAdditions.length === 0) return;
			const additions = extraction.rosterAdditions.map((performer, index) => ({
				...performer,
				aliases: [...performer.aliases],
				colorId:
					performerColorIds[(performers.length + index) % performerColorIds.length] ?? 'olive',
				order: performers.length + index
			}));
			const names = additions.map((performer) => performer.displayName);
			const message =
				names.length === 1
					? `Imported ${names[0]} into the roster.`
					: `Imported ${names.length} performers into the roster.`;
			commitRoster([...performers, ...additions], message);
		},
		addPerformer(displayName) {
			const trimmed = displayName.trim();
			if (!trimmed) return;
			const next: PerformerRecord = {
				id: deps.idFactory(),
				displayName: trimmed,
				normalizedKey: normalizedKey(trimmed),
				aliases: [],
				colorId: performerColorIds[performers.length % performerColorIds.length] ?? 'olive',
				order: performers.length
			};
			commitRoster([...performers, next], `Added ${trimmed} to the roster.`);
		},
		renamePerformer(id, displayName) {
			const trimmed = displayName.trim();
			const current = performers.find((performer) => performer.id === id);
			if (!current || !trimmed || current.displayName === trimmed) return;
			commitRoster(
				performers.map((performer) =>
					performer.id === id
						? {
								...performer,
								displayName: trimmed,
								normalizedKey: normalizedKey(trimmed)
							}
						: performer
				),
				`Renamed ${current.displayName} to ${trimmed}.`
			);
		},
		adoptHeaderRename(id, previousName, displayName) {
			const trimmed = displayName.trim();
			const current = performers.find((performer) => performer.id === id);
			if (!current || !trimmed) return;
			// The previous spelling stays as an alias so undoing the document edit,
			// or a header the user has not retyped yet, still resolves to this
			// performer instead of importing a duplicate.
			const aliases = [...current.aliases, previousName].filter(
				(alias, index, allAliases) =>
					alias.length > 0 && alias !== trimmed && allAliases.indexOf(alias) === index
			);
			if (
				current.displayName === trimmed &&
				aliases.length === current.aliases.length &&
				aliases.every((alias, index) => alias === current.aliases[index])
			) {
				return;
			}
			// The header edit already lives in editor undo, so this roster update
			// deliberately carries no toast of its own.
			setRoster(
				performers.map((performer) =>
					performer.id === id
						? {
								...performer,
								displayName: trimmed,
								normalizedKey: normalizedKey(trimmed),
								aliases
							}
						: performer
				)
			);
		},
		mergePerformers(sourceId, targetId) {
			if (sourceId === targetId) return;
			const source = performers.find((performer) => performer.id === sourceId);
			const target = performers.find((performer) => performer.id === targetId);
			if (!source || !target) return;
			const aliases = [...target.aliases, source.displayName, ...source.aliases].filter(
				(alias, index, allAliases) =>
					alias !== target.displayName && allAliases.indexOf(alias) === index
			);
			commitRoster(
				performers
					.filter((performer) => performer.id !== sourceId)
					.map((performer) => (performer.id === targetId ? { ...performer, aliases } : performer)),
				`Merged ${source.displayName} into ${target.displayName}.`
			);
		},
		removePerformer(id) {
			const performer = performers.find((candidate) => candidate.id === id);
			if (!performer) return;
			commitRoster(
				performers.filter((candidate) => candidate.id !== id),
				`Removed ${performer.displayName} from the roster.`
			);
		}
	};
}
