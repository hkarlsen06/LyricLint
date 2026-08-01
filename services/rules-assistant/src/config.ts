/** Layered abuse limits. The minute throttles live in Worker Rate Limiting
 * bindings (approximate, fast); everything here that is exact — daily counts,
 * concurrency, spend — is enforced by the QuotaCounter Durable Object. */
export const LIMITS = {
	/** Requests per minute per anonymous browser session (rate-limit binding). */
	sessionPerMinute: 5,
	/** Requests per minute per hashed IP (rate-limit binding). */
	ipPerMinute: 15,
	/** Requests per day per browser session (exact, Durable Object). */
	sessionPerDay: 25,
	/** Requests per day per hashed IP (exact, Durable Object). */
	ipPerDay: 75,
	/** Concurrent requests per browser session. */
	sessionConcurrent: 1,
	/** Concurrent requests per hashed IP. */
	ipConcurrent: 3,
	/** Approximate daily AI spend per browser session, USD. */
	sessionDailySpendUsd: 0.5,
	/** Global daily AI spend ceiling, USD (also enforced at the AI Gateway). */
	globalDailySpendUsd: 15
} as const;

export const REQUEST_RULES = {
	/** Maximum request body, bytes. */
	maxBodyBytes: 64 * 1024,
	/** Maximum question length in Unicode code points. */
	maxQuestionChars: 2000,
	/** Maximum messages a client may supply before server pruning. */
	maxSuppliedMessages: 40,
	/** History window sent to the model, in characters of complete exchanges. */
	historyWindowChars: 24_000
} as const;

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
	reasoning: { effort: 'max', context: 'current_turn' },
	maxOutputTokens: 8192,
	/** A hung provider call must release concurrency slots; abort after this. */
	providerTimeoutMs: 120_000,
	/** Standard-processing prices per 1M tokens. Gateway spend limits remain the
	 * authoritative global ceiling; these enforce the per-session approximation. */
	estInputUsdPerMTok: 1,
	estCachedInputUsdPerMTok: 0.1,
	/** GPT-5.6 explicit cache writes are billed at 1.25x uncached input. */
	estCacheWriteUsdPerMTok: 1.25,
	estOutputUsdPerMTok: 6
} as const;

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
