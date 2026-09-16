import type { ConversionDocument } from '../conversion/model.js';
import { hasConversionContent } from '../conversion/model.js';
import { renderProfile } from '../conversion/projection.js';
import { validateModel } from '../conversion/validation.js';
import type { ProfileId } from '../profiles/types.js';
import { profilePolicyVersions } from '../profiles/versions.js';

/** The exact model and rendered recovery text are committed together. */
export interface ConversionEnvelope {
	schema: 1;
	profile: ProfileId;
	model: ConversionDocument;
	converterVersion: '1';
	policyVersions: { genius: string; musixmatch: string };
	projectionText: string;
}

export interface ConversionRecovery {
	text: string;
	checkpoint: ConversionEnvelope;
	reason: string;
	sourceDraftId?: string;
}

export interface OriginalRecovery {
	sourceDraftId: string;
	reason: string;
}

export function parseOriginalRecovery(value: unknown): OriginalRecovery {
	if (
		!object(value) ||
		typeof value.sourceDraftId !== 'string' ||
		!value.sourceDraftId ||
		typeof value.reason !== 'string' ||
		!value.reason
	) {
		throw new ConversionStorageError('The original-data recovery reference is invalid.');
	}
	return { sourceDraftId: value.sourceDraftId, reason: value.reason };
}

export function parseConversionRecovery(value: unknown, expectedText: string): ConversionRecovery {
	if (
		!object(value) ||
		value.text !== expectedText ||
		typeof value.reason !== 'string' ||
		!value.reason
	) {
		throw new ConversionStorageError('The conversion recovery record is incomplete.');
	}
	const recovery: ConversionRecovery = {
		text: expectedText,
		reason: value.reason,
		checkpoint: parseConversionEnvelope(value.checkpoint)
	};
	if (value.sourceDraftId !== undefined)
		recovery.sourceDraftId = parseOriginalRecovery(value).sourceDraftId;
	return recovery;
}

export class ConversionStorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConversionStorageError';
	}
}

/** Fields this boundary reads, still untrusted until each parser validates them. */
interface StoredConversionFields {
	schema?: unknown;
	converterVersion?: unknown;
	profile?: unknown;
	model?: unknown;
	policyVersions?: unknown;
	projectionText?: unknown;
	genius?: unknown;
	musixmatch?: unknown;
	text?: unknown;
	checkpoint?: unknown;
	reason?: unknown;
	sourceDraftId?: unknown;
}
function object(value: unknown): value is StoredConversionFields {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Refuse the whole envelope: an unreadable field must never become a plain-text save. */
export function parseConversionEnvelope(value: unknown, expectedText?: string): ConversionEnvelope {
	if (!object(value) || value.schema !== 1 || value.converterVersion !== '1') {
		throw new ConversionStorageError(
			'This conversion document needs a supported version of LyricLint.'
		);
	}
	if (value.profile !== 'genius' && value.profile !== 'musixmatch') {
		throw new ConversionStorageError('The saved lyric profile is not supported.');
	}
	const versions = value.policyVersions;
	if (
		!object(versions) ||
		typeof versions.genius !== 'string' ||
		!versions.genius ||
		typeof versions.musixmatch !== 'string' ||
		!versions.musixmatch ||
		typeof value.projectionText !== 'string'
	) {
		throw new ConversionStorageError('The conversion document is incomplete.');
	}
	if (
		versions.genius !== profilePolicyVersions.genius ||
		versions.musixmatch !== profilePolicyVersions.musixmatch
	) {
		throw new ConversionStorageError(
			'The saved guideline version is unavailable. The original record has been preserved.'
		);
	}
	const parsed = validateModel(value.model);
	if (!parsed.ok) throw new ConversionStorageError(parsed.refusal.message);
	const projection = renderProfile(parsed.value, value.profile);
	if (!projection.ok) throw new ConversionStorageError(projection.refusal.message);
	if (
		projection.value.text !== value.projectionText ||
		(expectedText !== undefined && expectedText !== value.projectionText)
	) {
		throw new ConversionStorageError('The saved lyrics and conversion document do not match.');
	}
	return {
		schema: 1,
		profile: value.profile,
		// SAFETY: validateModel checked every field; JSON cloning its JSON data only unwraps state proxies.
		model: JSON.parse(JSON.stringify(parsed.value)) as ConversionDocument,
		converterVersion: '1',
		policyVersions: { genius: versions.genius, musixmatch: versions.musixmatch },
		projectionText: value.projectionText
	};
}

export function createConversionEnvelope(
	model: ConversionDocument,
	profile: ProfileId,
	policyVersions: ConversionEnvelope['policyVersions']
): ConversionEnvelope {
	const projection = renderProfile(model, profile);
	if (!projection.ok) throw new ConversionStorageError(projection.refusal.message);
	return parseConversionEnvelope({
		schema: 1,
		profile,
		model,
		converterVersion: '1',
		policyVersions,
		projectionText: projection.value.text
	});
}

export function copyConversionEnvelope(
	envelope: ConversionEnvelope,
	expectedText?: string
): ConversionEnvelope {
	return parseConversionEnvelope(envelope, expectedText);
}

/** Hidden structure and deliberate facts survive even when a profile renders no words. */
export function hasConversionMetadata(envelope: ConversionEnvelope | undefined): boolean {
	return envelope !== undefined && hasConversionContent(envelope.model);
}
