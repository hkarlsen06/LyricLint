/**
 * Canonical rule data for the inline previews. The assistant response carries
 * only validated rule ids; everything a preview displays — title, severity,
 * examples, fix behavior, sources — is resolved here against the same
 * generated corpus the Worker validates citations with, never from model
 * output. Loaded lazily so the artifact stays out of the initial bundle.
 */

export interface RulePreviewSource {
	id: string;
	pageTitle: string;
	sectionTitle: string;
	url: string;
	lastVerifiedAt: string;
}

export interface RulePreview {
	id: string;
	slug: string;
	title: string;
	severity: 'error' | 'warning' | 'suggestion' | 'manual-review';
	explanation: string;
	fix: 'safe' | 'preview' | 'none';
	fixLabel?: string;
	language: string;
	flaggedExample: string;
	acceptedExample: string;
	sources: RulePreviewSource[];
}

interface CorpusShape {
	ruleSetVersion: string;
	rules: Array<Omit<RulePreview, 'sources'> & { sourceIds: string[] }>;
	sources: RulePreviewSource[];
}

let cache:
	| Promise<{
			ruleSetVersion: string;
			previews: Map<string, RulePreview>;
			sources: Map<string, RulePreviewSource>;
	  }>
	| undefined;

export function loadRulePreviews(): Promise<{
	ruleSetVersion: string;
	previews: Map<string, RulePreview>;
	sources: Map<string, RulePreviewSource>;
}> {
	cache ??= import('../../../services/rules-assistant/generated/rules-context.json').then(
		(module) => {
			const corpus = (module.default ?? module) as unknown as CorpusShape;
			const sourcesById = new Map(corpus.sources.map((source) => [source.id, source]));
			const previews = new Map<string, RulePreview>(
				corpus.rules.map((rule) => [
					rule.id,
					{
						...rule,
						sources: rule.sourceIds.flatMap((sourceId) => {
							const source = sourcesById.get(sourceId);
							return source ? [source] : [];
						})
					}
				])
			);
			return { ruleSetVersion: corpus.ruleSetVersion, previews, sources: sourcesById };
		}
	);
	return cache;
}
