/** Layered abuse limits. The minute throttles live in Worker Rate Limiting
 * bindings (approximate, fast); everything here that is exact — daily counts,
 * concurrency, spend — is enforced by the QuotaCounter Durable Object. */
export const LIMITS = {
	/** Provider requests per minute per anonymous browser session (rate-limit
	 * binding). One logical user turn may legitimately spend five requests — the
	 * initial call plus four draft-tool continuations — so leave room for six
	 * conversational turns before treating the traffic as a burst. */
	sessionPerMinute: 30,
	/** Requests per minute per hashed IP (rate-limit binding). Keep room for
	 * three independently active sessions behind one address. */
	ipPerMinute: 90,
	/** Requests per day per browser session (exact, Durable Object). Testing-
	 * phase allowance: an agent turn is several requests, and the owner burned
	 * the earlier 25 in one afternoon of testing. The spend caps below are the
	 * real ceiling; tighten these counts again at launch. See ../LAUNCH.md. */
	sessionPerDay: 100,
	/** Requests per day per hashed IP (exact, Durable Object). */
	ipPerDay: 300,
	/** Concurrent requests per browser session. */
	sessionConcurrent: 1,
	/** Concurrent requests per hashed IP. */
	ipConcurrent: 3,
	/** Approximate daily AI spend per browser session, USD. */
	sessionDailySpendUsd: 2,
	/** Approximate daily AI spend per hashed IP, USD. */
	ipDailySpendUsd: 4,
	/** Deployment-wide in-flight requests. Spend reservations are the primary
	 * global overshoot guard; this also bounds upstream pressure. */
	globalConcurrent: 8,
	/** Global daily AI spend ceiling, USD (also enforced at the AI Gateway). */
	globalDailySpendUsd: 15
} as const;

/** Production Turnstile hostnames. Local names are added only under the
 * explicit development flag in `turnstileVerifier`. */
export const TURNSTILE_HOSTNAMES = ['lyriclint.com', 'dev.lyriclint.com'] as const;

export const REQUEST_RULES = {
	/** Maximum request body, bytes. */
	maxBodyBytes: 256 * 1024,
	/** Maximum question length in Unicode code points. */
	maxQuestionChars: 2000,
	/** Maximum messages a client may supply before server pruning. */
	maxSuppliedMessages: 40,
	/** History window sent to the model, in characters of complete exchanges. */
	historyWindowChars: 24_000
} as const;

/** The live draft-tool suffix is deliberately small because every round is a
 * full-priced, stateless provider request. */
export const MAX_TOOL_ROUNDS = 4;
export const MAX_PROPOSALS = 8;
export const MAX_LINK_ACTIONS = 8;
export const MAX_LINK_HEADERS = 12;
export const MAX_LINK_SUMMARY_CHARS = 200;
export const MAX_LINK_SUMMARIES = 64;
export const MAX_TOOL_ARGUMENT_CHARS = 16_384;
export const MAX_DRAFT_CHARS = 30_000;
export const MAX_PROVIDER_ITEMS_CHARS = 100_000;

export const SESSION_RULES = {
	/** Signed anonymous session cookie lifetime. */
	cookieTtlMs: 24 * 60 * 60 * 1000,
	/** Successful requests before the session is rechallenged with Turnstile. */
	requestsPerChallenge: 10,
	/** Rate-accounting records expire after this long. */
	accountingTtlMs: 48 * 60 * 60 * 1000,
	cookieName: 'll_assistant_session'
} as const;

export const MODEL = {
	/** Provider-native OpenAI model id, routed through Cloudflare AI Gateway. */
	id: 'gpt-5.6-luna',
	// Medium keeps this interactive rules assistant on GPT-5.6's conversational
	// baseline. Higher efforts spend more of maxOutputTokens on reasoning and can
	// put long stretches of silence before the first streamed token.
	reasoning: { effort: 'medium', context: 'current_turn' },
	/** GPT-5.6 answer-length default. The prompt already bounds what an answer
	 * must contain (lookup-table summaries, the four-rule cap); this trims the
	 * prose around that content rather than the content itself. */
	verbosity: 'low',
	maxOutputTokens: 16_384,
	/** A hung provider call must release concurrency slots; abort after this. */
	providerTimeoutMs: 120_000,
	/** Standard-processing prices per 1M tokens. Gateway spend limits remain the
	 * authoritative global ceiling; these enforce the per-session approximation. */
	estInputUsdPerMTok: 0.2,
	estCachedInputUsdPerMTok: 0.02,
	/** GPT-5.6 explicit cache writes are billed at 1.25x uncached input. */
	estCacheWriteUsdPerMTok: 0.25,
	estOutputUsdPerMTok: 1.2
} as const;

/** Worst-case output spend held while a global request is in flight. The
 * provider cannot emit more than `maxOutputTokens`, so settling actual usage
 * can overshoot the global ceiling by at most one request. */
export const GLOBAL_REQUEST_SPEND_RESERVATION_USD =
	(MODEL.maxOutputTokens * MODEL.estOutputUsdPerMTok) / 1_000_000;

export const ANSWER_RULES = {
	/** Maximum distinct rich rule references per response. */
	maxRuleReferences: 4
} as const;

export interface Env {
	ASSISTANT_DISABLED: string;
	ALLOWED_ORIGIN: string;
	AI_GATEWAY_BASE_URL: string;
	AI_GATEWAY_TOKEN: string;
	OPENAI_API_KEY: string;
	TURNSTILE_SECRET: string;
	TURNSTILE_ALLOW_LOCALHOST?: string;
	ABUSE_HMAC_SECRET: string;
	SESSION_SIGNING_SECRET: string;
	QUOTAS: DurableObjectNamespace;
	SESSION_MINUTE_LIMIT: RateLimit;
	IP_MINUTE_LIMIT: RateLimit;
	METRICS?: AnalyticsEngineDataset;
}

/** Worker Rate Limiting binding surface (unsafe binding, not yet in workers-types). */
export interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
