/**
 * The second flavor a copy carries, and the arithmetic of reading it back.
 *
 * A clipboard entry is a set of representations and the paste target picks the
 * one it understands, which is what lets a copy carry its line timings and its
 * section links without the plain text ever learning: `text/plain` stays byte
 * for byte the lyrics — clean lyrics on the clipboard are this application's
 * entire output — and `text/html` carries the same lyrics with the metadata in
 * one attribute, where only a reader that asks for that flavor ever sees it.
 * An ordinary text field pastes the plain flavor and nothing else.
 *
 * Everything in the payload is relative to the copied fragment — 0-based line
 * indices into its own text — because the paste has no idea where in which
 * document the copy was made, and absolute numbers would be a claim about a
 * document that is no longer in front of anyone. The fragment's own line count
 * rides along as the guard: a `text/plain` that no longer splits into that many
 * lines is not the text this metadata describes, and the paste applies the text
 * alone rather than timings measured against something else.
 *
 * Pure arithmetic and strings, no CodeMirror and no DOM: the parse is a regex
 * over our own format rather than a document parser, because the one producer
 * of this attribute is the serializer beside it — anything else's HTML simply
 * has no `data-lyriclint` and reads as no metadata at all.
 */

/** One object in a parsed payload, keyed however whoever wrote it saw fit. */
type JsonObject = { [key: string]: Json };

/**
 * Anything `JSON.parse` can hand back, and what every read below takes.
 *
 * The string came off a clipboard, so nothing about its contents is promised —
 * but it did come through `JSON.parse`, so the grammar is known, and saying so
 * is what lets each check below be a predicate about a value rather than a
 * guess about a representation.
 */
type Json = string | number | boolean | null | Json[] | JsonObject;

/** A timing carried by the copy, keyed into the fragment's own lines. */
interface ClipboardAnchor {
	/** 0-based line index into the copied fragment. */
	line: number;
	/** Seconds into the source draft's audio. */
	time: number;
}

/**
 * One divergent run a carried link keeps its own, in fragment coordinates.
 *
 * The same shape as the draft record's `LinkHole` with the lines re-based,
 * because the fragment's lines are split exactly as the document's were — the
 * plain flavor is a byte-identical slice — so a column into a line means the
 * same characters on both sides of the trip.
 */
interface ClipboardHole {
	/** 0-based line the run starts on. */
	line: number;
	/** Characters into that line. */
	column: number;
	/** 0-based line the run ends on, the same line for a run inside one. */
	endLine: number;
	/** Characters into the ending line. */
	endColumn: number;
}

/**
 * The remote source the copied lines were transcribed from.
 *
 * A remote source is nothing but an id in a known alphabet, which is exactly
 * what a clipboard can carry; a local file is a handle only this browser can
 * redeem, so it never travels and its absence here is the design rather than a
 * gap. The name rides along so the paste can label the pending press — and,
 * where the target draft is still untitled, offer the song's own name — without
 * contacting anyone.
 */
export interface ClipboardMediaSource {
	kind: 'youtube' | 'spotify' | 'apple';
	id: string;
	name?: string;
}

/** One link group whose members were wholly inside the copy. */
export interface ClipboardLink {
	/** 0-based header lines within the fragment, in order. Fewer than two is not a link. */
	lines: number[];
	/** The runs each member keeps its own, absent where the members agree throughout. */
	holes?: ClipboardHole[];
}

export interface ClipboardMetadata {
	/** How many lines the copied text splits into — the guard against a foreign `text/plain`. */
	lines: number;
	anchors: ClipboardAnchor[];
	links: ClipboardLink[];
	/**
	 * Present only when the copy already carries timings or links, and the source
	 * is remote. The rider, never the trigger: a copy that is only words says
	 * nothing about a song, and claiming every copy in every draft with audio
	 * attached would put the whole workbench's copy path through this extension
	 * for a fact the words do not state.
	 */
	media?: ClipboardMediaSource;
}

/** The attribute the whole flavor hangs on; nothing else writes or reads it. */
const clipboardMetadataAttribute = 'data-lyriclint';

const payloadVersion = 1;

/**
 * The most attribute this parse will read, in characters.
 *
 * Nothing here was asked for: every paste into the editor reaches this function
 * with whatever the clipboard is holding, so the work has to be bounded before
 * it starts rather than by what turns out to be readable. A megabyte is orders
 * of magnitude past anything the serializer beside it writes — a song timed line
 * by line with every difference recorded runs to a few kilobytes — so the cap
 * refuses only payloads that were never ours.
 */
const maximumPayloadLength = 1_000_000;

function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function unescapeAttribute(value: string): string {
	return value
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&amp;', '&');
}

function escapeText(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The `text/html` flavor for one copy.
 *
 * The lyrics are in the markup as well as the attribute, escaped, so a
 * rich-text surface that picks this flavor still pastes the words — the
 * metadata is invisible there because an attribute nobody recognises is
 * dropped, not because the flavor hides the text.
 */
export function clipboardHtml(text: string, metadata: ClipboardMetadata): string {
	const payload = JSON.stringify({ v: payloadVersion, ...metadata });
	return `<div ${clipboardMetadataAttribute}="${escapeAttribute(payload)}"><pre>${escapeText(text)}</pre></div>`;
}

function isRecord(value: Json): value is JsonObject {
	return typeof value === 'object' && value !== null;
}

function isLineIndex(value: Json, lines: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < lines;
}

function isColumn(value: Json): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** How many lines the copied text splits into: at least one, and a whole number of them. */
function isLineCount(value: Json): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/** A position in the source draft's audio: finite, and not before the start of it. */
function isSeconds(value: Json): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function readAnchor(value: Json, lines: number): ClipboardAnchor | undefined {
	if (!isRecord(value)) return undefined;
	const { line, time } = value;
	if (!isLineIndex(line, lines)) return undefined;
	if (!isSeconds(time)) return undefined;
	return { line, time };
}

/**
 * A hole that cannot be read is dropped rather than sinking anything larger —
 * the same trade `backup.ts` makes: the link itself is still good, and losing
 * a difference costs one re-tick while refusing the whole payload costs the
 * timings beside it.
 */
function readHole(value: Json, lines: number): ClipboardHole | undefined {
	if (!isRecord(value)) return undefined;
	const { line, column, endLine, endColumn } = value;
	if (!isLineIndex(line, lines) || !isLineIndex(endLine, lines)) return undefined;
	if (!isColumn(column) || !isColumn(endColumn)) return undefined;
	if (line > endLine || (line === endLine && column > endColumn)) return undefined;
	return { line, column, endLine, endColumn };
}

const mediaKinds = new Set(['youtube', 'spotify', 'apple']);

/** The set above holds exactly the kinds the interface names, and nothing else writes to it. */
function isMediaKind(value: Json): value is ClipboardMediaSource['kind'] {
	return typeof value === 'string' && mediaKinds.has(value);
}

/**
 * An id is an opaque string in somebody else's alphabet, so the only checks
 * worth making are the ones that keep a lying payload cheap: present, and not
 * absurdly long.
 */
function isMediaId(value: Json): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

/** A name worth labelling a pending press with: something in it, and not a paragraph. */
function isMediaName(value: Json): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
}

/**
 * A name that cannot be read costs only itself — the source is still worth
 * carrying under its provisional label.
 */
function readMedia(value: Json): ClipboardMediaSource | undefined {
	if (!isRecord(value)) return undefined;
	const { kind, id, name } = value;
	if (!isMediaKind(kind)) return undefined;
	if (!isMediaId(id)) return undefined;
	const media: ClipboardMediaSource = { kind, id };
	if (isMediaName(name)) {
		media.name = name;
	}
	return media;
}

function readLink(value: Json, lines: number): ClipboardLink | undefined {
	if (!isRecord(value)) return undefined;
	if (!Array.isArray(value.lines)) return undefined;
	const headerLines = value.lines.filter((line): line is number => isLineIndex(line, lines));
	if (headerLines.length < 2 || new Set(headerLines).size !== headerLines.length) {
		return undefined;
	}
	const sorted = [...headerLines].sort((left, right) => left - right);
	const holes = Array.isArray(value.holes)
		? value.holes
				.map((hole) => readHole(hole, lines))
				.filter((hole): hole is ClipboardHole => hole !== undefined)
		: [];
	return holes.length > 0 ? { lines: sorted, holes } : { lines: sorted };
}

/**
 * The metadata out of a pasted `text/html` flavor, or `undefined` for anyone
 * else's HTML.
 *
 * Tolerant of the wrappers browsers and clipboard managers put around a stored
 * fragment — it looks for the one attribute rather than expecting the document
 * to start where the serializer's did — and strict about everything inside it:
 * an entry that cannot be read in full is dropped, and a payload carrying
 * nothing readable is no metadata at all.
 */
export function metadataFromClipboardHtml(html: string): ClipboardMetadata | undefined {
	const match = new RegExp(`${clipboardMetadataAttribute}="([^"]*)"`).exec(html);
	if (!match?.[1] || match[1].length > maximumPayloadLength) return undefined;
	let payload: Json;
	try {
		payload = JSON.parse(unescapeAttribute(match[1]));
	} catch {
		return undefined;
	}
	if (!isRecord(payload) || payload.v !== payloadVersion) return undefined;
	const { lines } = payload;
	if (!isLineCount(lines)) return undefined;

	// Both lists are cut to the fragment's own line count before anything is read
	// out of them, and neither cut can reach a payload the serializer wrote: an
	// anchor names a line and no line is claimed twice, and a link is two header
	// lines at least. What it bounds is the entry count a forged payload can spend
	// inside the size cap above.
	const seen = new Set<number>();
	const anchors = (Array.isArray(payload.anchors) ? payload.anchors : [])
		.slice(0, lines)
		.map((anchor) => readAnchor(anchor, lines))
		.filter((anchor): anchor is ClipboardAnchor => {
			if (!anchor || seen.has(anchor.line)) return false;
			seen.add(anchor.line);
			return true;
		});
	const links = (Array.isArray(payload.links) ? payload.links : [])
		.slice(0, lines)
		.map((link) => readLink(link, lines))
		.filter((link): link is ClipboardLink => link !== undefined);
	const media = readMedia(payload.media);

	if (anchors.length === 0 && links.length === 0 && !media) return undefined;
	return media ? { lines, anchors, links, media } : { lines, anchors, links };
}

/** Offset of each line's start within `text`; its length is the line count. */
export function lineStartOffsets(text: string): number[] {
	const starts = [0];
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) === 10) starts.push(index + 1);
	}
	return starts;
}
