import type {
	LegendVoiceGroup,
	ParsedDocument,
	PerformerId,
	PerformerRecord,
	TextRange
} from '$lib/core/types.js';
import { findExactPerformer } from './identity.js';
import { decodeLegendText } from './import.js';

/** Characters that would change how another header parses if mirrored into it. */
const STRUCTURAL_NAME_PATTERN = /[[\]<>,\n\r]/u;
const JOINT_SEPARATOR_PATTERN = /\s+&\s+/gu;

/**
 * One header-legend range that holds exactly one performer's name.
 *
 * A joint group such as `Avery & Blair` yields one atom per member, but only
 * when every member is already an exact roster identity — the same rule import
 * extraction uses, so a performer named `Echo & The Glass` is never split.
 */
export interface HeaderNameAtom extends TextRange {
	/** Exact source text of the atom. Never normalized. */
	text: string;
	/** Set only when the text resolves to one exact roster identity. */
	performerId?: PerformerId;
}

/** One performer name being edited plus every other header that spells it. */
export interface HeaderRenameTargets {
	performerId: PerformerId;
	/** The exact name the performer had before this edit. */
	previousName: string;
	/** The edited occurrence. */
	source: TextRange;
	/** Every other occurrence of the same performer, in document order. */
	targets: TextRange[];
}

function sliceAtom(atom: HeaderNameAtom, from: number, to: number): HeaderNameAtom {
	return {
		from: atom.from + from,
		to: atom.from + to,
		text: atom.text.slice(from, to)
	};
}

function jointPieces(atom: HeaderNameAtom): HeaderNameAtom[] {
	const pieces: HeaderNameAtom[] = [];
	let cursor = 0;

	for (const match of atom.text.matchAll(JOINT_SEPARATOR_PATTERN)) {
		pieces.push(sliceAtom(atom, cursor, match.index));
		cursor = match.index + match[0].length;
	}
	pieces.push(sliceAtom(atom, cursor, atom.text.length));
	return pieces;
}

function atomsForGroup(
	group: LegendVoiceGroup,
	roster: readonly PerformerRecord[]
): HeaderNameAtom[] {
	if (!group.markupSupported || group.nameRange.from >= group.nameRange.to) {
		return [];
	}

	const whole: HeaderNameAtom = {
		from: group.nameRange.from,
		to: group.nameRange.to,
		text: group.rawNameText
	};
	const exact = findExactPerformer(decodeLegendText(whole.text), roster);
	if (exact) {
		return [{ ...whole, performerId: exact.id }];
	}

	const pieces = jointPieces(whole);
	if (pieces.length < 2) {
		return [whole];
	}
	const members = pieces.map((piece) => findExactPerformer(decodeLegendText(piece.text), roster));
	return members.every((member) => member !== undefined)
		? pieces.map((piece, index) => ({ ...piece, performerId: members[index]?.id }))
		: [whole];
}

/** Every legend range that names exactly one performer, in document order. */
export function headerNameAtoms(
	document: ParsedDocument,
	roster: readonly PerformerRecord[]
): HeaderNameAtom[] {
	return document.sections.flatMap((section) =>
		(section.header?.legendGroups ?? []).flatMap((group) => atomsForGroup(group, roster))
	);
}

/**
 * Resolve the header name an edit lands in, plus its other header occurrences.
 *
 * The edited range must sit inside one legend name that already resolves to an
 * exact roster identity; a name the roster does not know is a plain text edit,
 * not a rename, and is left alone. Boundary positions count as inside so that
 * typing at either end of a name extends it. Nothing is returned when the
 * performer is named in only one header, because there is nothing to mirror.
 */
export function findHeaderRenameTargets(
	document: ParsedDocument,
	roster: readonly PerformerRecord[],
	change: TextRange
): HeaderRenameTargets | undefined {
	const atoms = headerNameAtoms(document, roster);
	const source = atoms.find(
		(atom) => atom.performerId !== undefined && atom.from <= change.from && change.to <= atom.to
	);
	const performerId = source?.performerId;
	if (!source || performerId === undefined) {
		return undefined;
	}

	const targets = atoms
		.filter((atom) => atom !== source && atom.performerId === performerId)
		.map((atom) => ({ from: atom.from, to: atom.to }));
	if (targets.length === 0) {
		return undefined;
	}

	return {
		performerId,
		previousName: source.text,
		source: { from: source.from, to: source.to },
		targets
	};
}

/** True when a name would break legend or header parsing in another header. */
export function nameBreaksHeaderStructure(name: string): boolean {
	return STRUCTURAL_NAME_PATTERN.test(name);
}

/**
 * Only a settled name is mirrored. A name that is still empty or padded with
 * whitespace belongs to an in-progress edit: the rename stays open so the next
 * keystroke mirrors the finished spelling, but no other header is touched yet.
 */
export function isMirrorableHeaderName(name: string): boolean {
	return name.length > 0 && name.trim() === name && !nameBreaksHeaderStructure(name);
}
