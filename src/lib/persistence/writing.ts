import type { ProfileId } from '../profiles/types.js';
import { CONVERSION_LIMITS } from '../conversion/model.js';
import { ConversionStorageError } from './conversion.js';

/** Creation choice stays editable until the first original content is authored. */
export type DraftWriting =
	| { schema: 1; phase: 'new'; profile: ProfileId }
	| {
			schema: 1;
			phase: 'writing';
			profile: 'genius';
			export?: { profile: 'musixmatch'; text: string };
	  }
	| {
			schema: 1;
			phase: 'writing';
			profile: 'musixmatch';
			export?: { profile: 'genius'; text: string };
	  };

export type AuthoredWriting = Extract<DraftWriting, { phase: 'writing' }>;
export const CREATION_PROFILE_PREFERENCE = 'newDraftProfile';

export function otherProfile(profile: ProfileId): ProfileId {
	return profile === 'genius' ? 'musixmatch' : 'genius';
}

export function newWriting(profile: ProfileId): DraftWriting {
	return { schema: 1, phase: 'new', profile };
}

function authored(profile: ProfileId, text?: string): AuthoredWriting {
	if (profile === 'genius') {
		const state: AuthoredWriting = { schema: 1, phase: 'writing', profile };
		if (text !== undefined) state.export = { profile: 'musixmatch', text };
		return state;
	}
	const state: AuthoredWriting = { schema: 1, phase: 'writing', profile };
	if (text !== undefined) state.export = { profile: 'genius', text };
	return state;
}

/** Legacy drafts keep the representation that was saved, never a creation preference. */
export function legacyWriting(savedProfile: ProfileId = 'genius'): AuthoredWriting {
	return authored(savedProfile);
}

export function beginWriting(state: DraftWriting): AuthoredWriting {
	return state.phase === 'writing' ? state : authored(state.profile);
}

/** A complete draft save owns the source and its cached export atomically. */
export function withExportCopy(state: AuthoredWriting, text: string): AuthoredWriting {
	if (text.length > CONVERSION_LIMITS.text)
		throw new ConversionStorageError('The edited export exceeds the supported text size.');
	return authored(state.profile, text);
}

/** An original edit expires output; it never makes the original a new format choice again. */
export function expireExportCopy(state: DraftWriting): DraftWriting {
	return state.phase === 'new' ? state : authored(state.profile);
}

interface StoredWriting {
	schema?: unknown;
	phase?: unknown;
	profile?: unknown;
	export?: unknown;
	text?: unknown;
}

function object(value: unknown): value is StoredWriting {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Disk and portable files validate the whole state before keeping any edited export. */
export function parseWriting(value: unknown, conversionProfile?: ProfileId): DraftWriting {
	if (
		!object(value) ||
		value.schema !== 1 ||
		(value.phase !== 'new' && value.phase !== 'writing') ||
		(value.profile !== 'genius' && value.profile !== 'musixmatch')
	)
		throw new ConversionStorageError('The saved writing format is invalid.');
	if (conversionProfile !== undefined && value.profile !== conversionProfile)
		throw new ConversionStorageError(
			'The main format and saved lyric representation do not match.'
		);
	if (value.phase === 'new') {
		if (value.export !== undefined)
			throw new ConversionStorageError('A new writing choice cannot carry an edited export.');
		return newWriting(value.profile);
	}
	if (value.export === undefined) return authored(value.profile);
	if (
		!object(value.export) ||
		value.export.profile !== otherProfile(value.profile) ||
		typeof value.export.text !== 'string'
	)
		throw new ConversionStorageError('The saved export does not match its main draft.');
	return withExportCopy(authored(value.profile), value.export.text);
}
