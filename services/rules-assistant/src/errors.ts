/**
 * The public error vocabulary. Every failure the Worker reports uses one of
 * these codes with its fixed HTTP status, so the frontend can switch on the
 * code and never on prose.
 */
export type ErrorCode =
	| 'invalid_request'
	| 'challenge_required'
	| 'challenge_failed'
	| 'request_in_progress'
	| 'rate_limited'
	| 'daily_limit_reached'
	| 'spend_limit_reached'
	| 'invalid_answer'
	| 'provider_error'
	| 'service_disabled';

const ERROR_STATUS: Record<ErrorCode, number> = {
	invalid_request: 400,
	challenge_required: 403,
	challenge_failed: 403,
	request_in_progress: 409,
	rate_limited: 429,
	daily_limit_reached: 429,
	spend_limit_reached: 429,
	invalid_answer: 502,
	provider_error: 502,
	service_disabled: 503
};

export class ApiError extends Error {
	readonly code: ErrorCode;
	readonly detail?: string;

	constructor(code: ErrorCode, detail?: string) {
		super(detail ?? code);
		this.code = code;
		this.detail = detail;
	}

	get status(): number {
		return ERROR_STATUS[this.code];
	}
}

export function errorBody(error: ApiError): {
	error: { code: ErrorCode; message: string };
} {
	return { error: { code: error.code, message: error.detail ?? error.code } };
}
