/**
 * The guidance catalog: reviewed transcription conventions the linter cannot
 * check, behind the planned `/guidelines/` pages and the assistant corpus's
 * guidance section.
 *
 * An entry is one checkable claim in LyricLint's own words — never quoted
 * Genius prose, for the corpus's own reason: a quotation would be hand-written
 * content with no generator to re-derive it, over annotations that change.
 * The paraphrase is the human interpretation the source policy already
 * requires, and the entry's sources are pointers into the same registry every
 * rule cites.
 *
 * A convention the linter later learns to check graduates into a rule and its
 * entry retires in that rule's favor — an entry and a rule must not state the
 * same claim under two ids, which is `isProseHeaderLine`'s failure arriving in
 * the catalog. `relatedRuleIds` is for partial coverage only: the entry states
 * the whole convention, the rule checks the slice of it a machine can see.
 */
import type { SourceAuthority } from '$lib/core/types.js';

/** Topic titles, keyed by the id segment guidance entry ids carry. */
export const guidanceTopicTitles = {
	'section-headers': 'Section headers',
	spelling: 'Spelling',
	capitalization: 'Capitalization',
	'ad-libs': 'Ad-libs',
	punctuation: 'Punctuation',
	lines: 'Lines and repeats',
	'censored-unknown': 'Censored and unknown words',
	numbers: 'Numbers',
	'non-english': 'Non-English songs',
	sourcing: 'Sourcing lyrics'
} as const;

export type GuidanceTopic = keyof typeof guidanceTopicTitles;

/**
 * The catalog's learning order, independent of where its entries are stored.
 * A new transcriber meets the everyday writing decisions first: spelling is
 * also the doorway to the standardized-spellings lookup, then the document's
 * structure, vocal additions, and increasingly situational conventions.
 */
export const guidanceTopicOrder: readonly GuidanceTopic[] = [
	'spelling',
	'section-headers',
	'lines',
	'ad-libs',
	'censored-unknown',
	'punctuation',
	'capitalization',
	'numbers',
	'non-english',
	'sourcing'
];

/** A substantial lookup that lives on a topic page beside its prose entries. */
export interface GuidanceTopicLandmark {
	id: string;
	title: string;
	statement: string;
}

/** Landmarks are searchable rows in the index, not hidden furniture on a page. */
export const guidanceTopicLandmarks: Partial<
	Record<GuidanceTopic, readonly GuidanceTopicLandmark[]>
> = {
	spelling: [
		{
			id: 'standardized-spellings',
			title: 'The standardized spellings',
			statement: 'The reviewed preferred forms and the spellings the guide corrects.'
		}
	]
};

/**
 * The linter rule families each topic page also lists, as lookups pointing
 * into `/rules/<slug>/` — so a topic is one place to look a convention up
 * whether the linter checks it or not. The list is derived from the rule
 * reference at prerender time and never written out here; what is editorial
 * is only which families belong to which topic. Keys are rule-id prefixes
 * (`punctuation.question` → `punctuation`), and `guidance.test.ts` pins that
 * every named family still has rules.
 */
export const guidanceTopicRuleGroups: Record<GuidanceTopic, readonly string[]> = {
	'section-headers': ['section', 'performer'],
	spelling: ['spelling', 'contraction'],
	capitalization: ['capitalization'],
	// The sound-effect family sits with the ad-libs: both are marks about what
	// a voice is doing beside the lead, and G-SFX is this cluster's other half.
	'ad-libs': ['adlib', 'sound-effect'],
	punctuation: ['punctuation', 'quotes'],
	// The text family is whitespace hygiene — doubled spaces, invisible
	// characters — which is a fact about how a line is laid out, so it sits
	// with the line-format conventions rather than under any other topic.
	lines: ['line', 'repeat', 'text'],
	// Both families are marks standing in for words the transcriber cannot
	// write as sung — censored by the recording, or impossible to make out —
	// which is also why the unknown family homes here although its own source
	// seeds no entries: the [?] rules check the whole of that convention.
	'censored-unknown': ['censored', 'unknown'],
	numbers: ['numbers'],
	'non-english': ['language'],
	// Sourcing is about where a transcription comes from, which no rule can
	// see — the empty list is the honest answer, not a placeholder.
	sourcing: []
};

/**
 * A verbatim illustration, in the rule reference's own labeled-pair shape. A
 * sample holds only text as it would stand in a document — prose explaining a
 * sample belongs in the statement or the note, because inside the sample face
 * it reads as part of the very thing being quoted.
 */
export interface GuidanceExample {
	/** The form the convention wants, exactly as written. */
	correct?: string;
	/** The form it corrects, exactly as written. */
	incorrect?: string;
}

/** One reviewed transcription convention the linter cannot check whole. */
export interface GuidanceEntry {
	/** `guidance.<topic>.<slug>` — stable, and the anchor on the topic page. */
	id: string;
	topic: GuidanceTopic;
	/**
	 * States what the guideline says, as a compressed instruction — the
	 * register of Genius's own guide items ("Use standardized spellings"), and
	 * deliberately NOT the rule reference's failure-naming register. A rules
	 * reader arrives with a symptom and wants its rule; a guidelines reader
	 * arrives wondering how something works and searches for the convention.
	 */
	title: string;
	/** LyricLint's reviewed paraphrase of the convention. Never quoted prose. */
	statement: string;
	/** Invented illustrations — never a real transcription's lyrics. */
	example?: GuidanceExample;
	/**
	 * The trustworthiness claimed for this entry. Must equal the highest tier
	 * among the cited sources: promotion is adding the confirming higher-tier
	 * source to `sourceIds`, never editing this field alone, and
	 * `guidance.test.ts` enforces the equality structurally.
	 */
	authority: SourceAuthority;
	sourceIds: readonly string[];
	/** Linter rules that check part of this convention. */
	relatedRuleIds?: readonly string[];
	/** Hedges, scope limits, and graduation notes. */
	note?: string;
}

/** Higher is more trustworthy as Genius transcription policy. */
export const authorityRank: Record<SourceAuthority, number> = {
	staff: 3,
	editorial: 2,
	external: 1,
	community: 0
};

/** The tier as a reader-facing fact, worded as where the claim comes from. */
export const authorityLabels: Record<SourceAuthority, string> = {
	staff: 'Genius staff guidance',
	editorial: 'Editor-reviewed Genius annotation',
	external: 'External reference',
	community: 'Genius community guidance'
};

/** The anchor a topic page draws an entry at: the id's own last segment. */
export function entryAnchor(id: string): string {
	return id.slice(id.lastIndexOf('.') + 1);
}

/** The tier an entry backed by these sources is entitled to claim. */
export function highestAuthority(authorities: readonly SourceAuthority[]): SourceAuthority {
	if (authorities.length === 0) {
		throw new Error('An entry with no sources has no authority to claim');
	}
	return authorities.reduce((highest, candidate) =>
		authorityRank[candidate] > authorityRank[highest] ? candidate : highest
	);
}
