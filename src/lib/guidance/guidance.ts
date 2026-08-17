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
 * An entry states the convention whether or not the linter checks it: the
 * catalog is the conventions and the rules are the checks, and
 * `relatedRuleIds` is the one mapping tying the two — the entry's meta line
 * draws it as "Checked by", and each named rule's page links back through
 * `guidanceForRule`. What must still not exist is two *entries* stating one
 * claim, which is `isProseHeaderLine`'s failure arriving in the catalog.
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
	/** Linter rules whose convention this landmark states, as entries have. */
	relatedRuleIds?: readonly string[];
}

/** Landmarks are searchable rows in the index, not hidden furniture on a page. */
export const guidanceTopicLandmarks: Partial<
	Record<GuidanceTopic, readonly GuidanceTopicLandmark[]>
> = {
	spelling: [
		{
			id: 'standardized-spellings',
			title: 'The standardized spellings',
			statement: 'The reviewed preferred forms and the spellings the guide corrects.',
			relatedRuleIds: ['spelling.standardized']
		}
	]
};

/**
 * A rule page's pointer back into the catalog: the guideline whose convention
 * the rule checks, resolved to the topic page and the entry's own anchor. The
 * reverse of `relatedRuleIds`, derived in `guidanceForRule` so the two
 * directions cannot disagree about which rules and entries belong together.
 */
export interface RuleGuidelineLink {
	topic: GuidanceTopic;
	topicTitle: string;
	/** The fragment on the topic page: an entry's or a landmark's own anchor. */
	anchor: string;
	title: string;
}

/**
 * An entry's standing: a source tier, or LyricLint's own advisory.
 *
 * `lyriclint` is for a convention that is LyricLint's own preference rather
 * than anything a Genius source states — the blank line between song parts,
 * the text-hygiene checks. Such an entry still cites sources, but as
 * *context* the preference reads from rather than as backing, so the
 * source-equality rule does not apply to it, and its note names the claim as
 * LyricLint's own. A Genius name never goes on a claim no source states.
 */
export type GuidanceAuthority = SourceAuthority | 'lyriclint';

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

/** One reviewed transcription convention, checked by rules or not at all. */
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
	 * `guidance.test.ts` enforces the equality structurally. The exception is
	 * `lyriclint`, whose sources are context rather than backing — see
	 * `GuidanceAuthority`.
	 */
	authority: GuidanceAuthority;
	sourceIds: readonly string[];
	/**
	 * Linter rules that check this convention, in whole or in part. This is
	 * the one mapping between the two references: the entry's meta line draws
	 * it as "Checked by", and each named rule's own page links back to this
	 * entry through `guidanceForRule` — adding a rule id here is what gives
	 * that rule's page its guideline link.
	 */
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
export const authorityLabels: Record<GuidanceAuthority, string> = {
	staff: 'Genius staff guidance',
	editorial: 'Editor-reviewed Genius annotation',
	external: 'External reference',
	community: 'Genius community guidance',
	lyriclint: 'LyricLint advisory'
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
