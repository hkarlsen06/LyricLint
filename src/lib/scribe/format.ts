import type {
	CompareBaselineRecord,
	LineAnchor,
	PerformerRecord,
	SectionLink,
	SerializedSelection
} from '$lib/core/types.js';
import type { ClipboardMediaSource } from '$lib/editor/contracts.js';
import { performerColorIds } from '$lib/performers/color.js';

const scribeFormat = 'LYRICLINT_SCRIBE';
const scribeVersion = 1;

interface ScribeProject {
	format: typeof scribeFormat;
	version: typeof scribeVersion;
	document: {
		title: string;
		language: string;
		lyrics: string;
		originalText?: string;
		selection?: SerializedSelection;
		compareBaseline?: CompareBaselineRecord;
	};
	performers: PerformerRecord[];
	sectionLinks: SectionLink[];
	lineAnchors: LineAnchor[];
	ignoredDiagnostics: string[];
	song?: ClipboardMediaSource;
}

interface ScribeProjectInput {
	title: string;
	language: string;
	lyrics: string;
	originalText?: string;
	selection?: SerializedSelection;
	compareBaseline?: CompareBaselineRecord;
	performers: readonly PerformerRecord[];
	sectionLinks: readonly SectionLink[];
	lineAnchors: readonly LineAnchor[];
	ignoredDiagnostics: readonly string[];
	song?: ClipboardMediaSource;
}

export class ScribeFormatError extends Error {}

/**
 * The ceiling a `.lls` is read under, mirroring `MAX_BACKUP_BYTES` in
 * `persistence/backup.ts`.
 *
 * A Scribe is a shared file, which is the one path in this application where
 * somebody else's bytes become workspace state — so the size is refused before
 * `file.text()` is awaited rather than after a browser has decoded it into a
 * string. It is stated here beside the parser, because the cap is a fact about
 * the format rather than about the surface that reads one.
 */
export const maxScribeBytes = 50 * 1024 * 1024;

/**
 * A value read out of a parsed `.lls` payload: JSON, or a key the file does not
 * have at all. Nothing below takes `unknown`, because what arrives here has
 * already been through `JSON.parse` — what is still open is which of JSON's own
 * six shapes each field turned out to be, and answering that is this module's
 * whole job.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject | undefined;

interface JsonObject {
	readonly [key: string]: JsonValue;
}

function record(value: JsonValue): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: JsonValue): value is string {
	return typeof value === 'string';
}

function number(value: JsonValue): value is number {
	return typeof value === 'number';
}

function string(value: JsonValue, field: string): string {
	if (!text(value)) throw new ScribeFormatError(`${field} must be text.`);
	return value;
}

function finiteNumber(value: JsonValue, field: string): number {
	if (!number(value) || !Number.isFinite(value)) {
		throw new ScribeFormatError(`${field} must be a finite number.`);
	}
	return value;
}

function integer(value: JsonValue, field: string, minimum = 0): number {
	const parsed = finiteNumber(value, field);
	if (!Number.isInteger(parsed) || parsed < minimum) {
		throw new ScribeFormatError(`${field} must be an integer of at least ${minimum}.`);
	}
	return parsed;
}

function optionalString(value: JsonValue, field: string): string | undefined {
	return value === undefined ? undefined : string(value, field);
}

function stringArray(value: JsonValue, field: string): string[] {
	if (!Array.isArray(value)) throw new ScribeFormatError(`${field} must be a list.`);
	return value.map((item, index) => string(item, `${field}[${index}]`));
}

function parseSelection(value: JsonValue): SerializedSelection | undefined {
	if (value === undefined) return undefined;
	if (!record(value)) throw new ScribeFormatError('document.selection must be an object.');
	return {
		anchor: integer(value.anchor, 'document.selection.anchor'),
		head: integer(value.head, 'document.selection.head')
	};
}

function parseBaseline(value: JsonValue): CompareBaselineRecord | undefined {
	if (value === undefined) return undefined;
	if (!record(value)) throw new ScribeFormatError('document.compareBaseline must be an object.');
	return {
		text: string(value.text, 'document.compareBaseline.text'),
		pastedAt: string(value.pastedAt, 'document.compareBaseline.pastedAt')
	};
}

function parsePerformers(value: JsonValue): PerformerRecord[] {
	if (!Array.isArray(value)) throw new ScribeFormatError('performers must be a list.');
	return value.map((item, index) => {
		if (!record(item)) throw new ScribeFormatError(`performers[${index}] must be an object.`);
		// A color is a token from the palette, not free text: it is what the
		// gutter bar, the legend and the picker chip all resolve a
		// `--performer-*` custom property from, so a name nothing declares draws
		// no color anywhere and reads as a voice the workbench forgot. Refused
		// rather than reallocated, because this parser refuses everything it
		// cannot vouch for — a Scribe carrying one is a file this build did not
		// write, and the rest of it is no more trustworthy.
		const colorId = string(item.colorId, `performers[${index}].colorId`);
		if (!performerColorIds.some((paletteId) => paletteId === colorId)) {
			throw new ScribeFormatError(`performers[${index}].colorId is not a performer color.`);
		}
		return {
			id: string(item.id, `performers[${index}].id`),
			displayName: string(item.displayName, `performers[${index}].displayName`),
			normalizedKey: string(item.normalizedKey, `performers[${index}].normalizedKey`),
			aliases: stringArray(item.aliases, `performers[${index}].aliases`),
			colorId,
			order: integer(item.order, `performers[${index}].order`)
		};
	});
}

function parseLinks(value: JsonValue): SectionLink[] {
	if (!Array.isArray(value)) throw new ScribeFormatError('sectionLinks must be a list.');
	return value.map((item, index) => {
		if (!record(item)) throw new ScribeFormatError(`sectionLinks[${index}] must be an object.`);
		if (!Array.isArray(item.lines)) {
			throw new ScribeFormatError(`sectionLinks[${index}].lines must be a list.`);
		}
		const lines = item.lines.map((line, lineIndex) =>
			integer(line, `sectionLinks[${index}].lines[${lineIndex}]`, 1)
		);
		if (lines.length < 2) {
			throw new ScribeFormatError(`sectionLinks[${index}].lines must contain at least two lines.`);
		}
		// A member twice over is one header standing for two copies, which every
		// translation downstream reads as a group whose counts do not add up — so
		// `[3, 3]` is a link with one member, not two. Sorted for the same reason
		// the clipboard's own reader sorts: the mirror pairs members by position,
		// and a list in the order somebody's file happened to write it is not one.
		if (new Set(lines).size !== lines.length) {
			throw new ScribeFormatError(`sectionLinks[${index}].lines must name distinct lines.`);
		}
		lines.sort((left, right) => left - right);
		if (item.holes === undefined) return { lines };
		if (!Array.isArray(item.holes)) {
			throw new ScribeFormatError(`sectionLinks[${index}].holes must be a list.`);
		}
		return {
			lines,
			holes: item.holes.map((hole, holeIndex) => {
				if (!record(hole)) {
					throw new ScribeFormatError(
						`sectionLinks[${index}].holes[${holeIndex}] must be an object.`
					);
				}
				return {
					line: integer(hole.line, `sectionLinks[${index}].holes[${holeIndex}].line`, 1),
					column: integer(hole.column, `sectionLinks[${index}].holes[${holeIndex}].column`),
					endLine: integer(hole.endLine, `sectionLinks[${index}].holes[${holeIndex}].endLine`, 1),
					endColumn: integer(hole.endColumn, `sectionLinks[${index}].holes[${holeIndex}].endColumn`)
				};
			})
		};
	});
}

function parseAnchors(value: JsonValue): LineAnchor[] {
	if (!Array.isArray(value)) throw new ScribeFormatError('lineAnchors must be a list.');
	return value.map((item, index) => {
		if (!record(item)) throw new ScribeFormatError(`lineAnchors[${index}] must be an object.`);
		return {
			line: integer(item.line, `lineAnchors[${index}].line`, 1),
			time: finiteNumber(item.time, `lineAnchors[${index}].time`)
		};
	});
}

/**
 * The alphabet each catalogue writes its ids in.
 *
 * An id restored from a Scribe is spent as a path segment against somebody
 * else's API, so the kind the file states is what says which shape it has to
 * be. A `.lls` that names a kind and carries an id from another one is a
 * pending press that can only ever come back a 404, several steps from here.
 */
const songIdShapes = {
	youtube: /^[A-Za-z0-9_-]{11}$/u,
	spotify: /^[A-Za-z0-9]{22}$/u,
	apple: /^\d{1,20}$/u
} satisfies Record<ClipboardMediaSource['kind'], RegExp>;

function parseSong(value: JsonValue): ClipboardMediaSource | undefined {
	if (value === undefined) return undefined;
	if (!record(value)) throw new ScribeFormatError('song must be an object.');
	if (value.kind !== 'youtube' && value.kind !== 'spotify' && value.kind !== 'apple') {
		throw new ScribeFormatError('song.kind is not supported.');
	}
	// The shape subsumes the clipboard reader's own pair of rules — present, and
	// not absurdly long — because every alphabet here states its own length.
	const id = string(value.id, 'song.id');
	if (!songIdShapes[value.kind].test(id)) {
		throw new ScribeFormatError(`song.id is not a ${value.kind} identifier.`);
	}
	if (value.name === undefined) return { kind: value.kind, id };
	// A name is a label on a pending press rather than anything the workbench
	// resolves, so the only thing worth asking of it is that it says something
	// and fits on a row.
	const name = string(value.name, 'song.name');
	if (name.trim().length === 0 || name.length > 300) {
		throw new ScribeFormatError('song.name must be text of at most 300 characters.');
	}
	return { kind: value.kind, id, name };
}

/** Serialize a complete, editable LyricLint project. */
export function serializeScribe(input: ScribeProjectInput): string {
	const scribeDocument: ScribeProject['document'] = {
		title: input.title,
		language: input.language,
		lyrics: input.lyrics
	};
	if (input.originalText !== undefined) scribeDocument.originalText = input.originalText;
	if (input.selection !== undefined) scribeDocument.selection = { ...input.selection };
	if (input.compareBaseline !== undefined) {
		scribeDocument.compareBaseline = { ...input.compareBaseline };
	}
	const project: ScribeProject = {
		format: scribeFormat,
		version: scribeVersion,
		document: scribeDocument,
		performers: input.performers.map((performer) => ({
			...performer,
			aliases: [...performer.aliases]
		})),
		sectionLinks: input.sectionLinks.map((link) => {
			const copy: SectionLink = { lines: [...link.lines] };
			if (link.holes) copy.holes = link.holes.map((hole) => ({ ...hole }));
			return copy;
		}),
		lineAnchors: input.lineAnchors.map((anchor) => ({ ...anchor })),
		ignoredDiagnostics: [...new Set(input.ignoredDiagnostics)].sort()
	};
	if (input.song !== undefined) project.song = { ...input.song };
	return `${JSON.stringify(project, null, 2)}\n`;
}

/** Parse and validate an untrusted `.lls` payload before any workspace state changes. */
export function parseScribe(source: string): ScribeProject {
	let value: JsonValue;
	try {
		value = JSON.parse(source);
	} catch {
		throw new ScribeFormatError('This file is not valid JSON.');
	}
	if (!record(value)) throw new ScribeFormatError('This file does not contain a Scribe project.');
	if (value.format !== scribeFormat) {
		throw new ScribeFormatError('This file is not a LyricLint Scribe.');
	}
	if (value.version !== scribeVersion) {
		throw new ScribeFormatError(
			number(value.version) && value.version > scribeVersion
				? 'This Scribe was made by a newer version of LyricLint.'
				: 'This Scribe version is not supported.'
		);
	}
	if (!record(value.document)) throw new ScribeFormatError('document must be an object.');
	const originalText = optionalString(value.document.originalText, 'document.originalText');
	const selection = parseSelection(value.document.selection);
	const compareBaseline = parseBaseline(value.document.compareBaseline);
	const lyrics = string(value.document.lyrics, 'document.lyrics');
	const performers = parsePerformers(value.performers);
	const sectionLinks = parseLinks(value.sectionLinks);
	const lineAnchors = parseAnchors(value.lineAnchors);
	const lineCount = lyrics.split('\n').length;
	if (selection && (selection.anchor > lyrics.length || selection.head > lyrics.length)) {
		throw new ScribeFormatError('document.selection falls outside the lyrics.');
	}
	if (lineAnchors.some((anchor) => anchor.line > lineCount)) {
		throw new ScribeFormatError('A line anchor falls outside the lyrics.');
	}
	if (
		sectionLinks.some(
			(link) =>
				link.lines.some((line) => line > lineCount) ||
				link.holes?.some((hole) => hole.line > lineCount || hole.endLine > lineCount)
		)
	) {
		throw new ScribeFormatError('A section link falls outside the lyrics.');
	}
	if (new Set(performers.map((performer) => performer.id)).size !== performers.length) {
		throw new ScribeFormatError('Performer identifiers must be unique.');
	}
	const scribeDocument: ScribeProject['document'] = {
		title: string(value.document.title, 'document.title'),
		language: string(value.document.language, 'document.language'),
		lyrics
	};
	if (originalText !== undefined) scribeDocument.originalText = originalText;
	if (selection !== undefined) scribeDocument.selection = selection;
	if (compareBaseline !== undefined) scribeDocument.compareBaseline = compareBaseline;
	const project: ScribeProject = {
		format: scribeFormat,
		version: scribeVersion,
		document: scribeDocument,
		performers,
		sectionLinks,
		lineAnchors,
		ignoredDiagnostics: stringArray(value.ignoredDiagnostics, 'ignoredDiagnostics')
	};
	const song = parseSong(value.song);
	if (song !== undefined) project.song = song;
	return project;
}
