/**
 * Exact accounting, one Durable Object per hashed identifier (session, IP, or
 * the literal 'global'). The DO is single-threaded, so check-and-increment is
 * atomic without locks. Backed by SQLite-class storage; every record carries a
 * day stamp and an alarm clears state after the 48-hour accounting TTL.
 */
import { SESSION_RULES } from './config';
import type { ErrorCode } from './errors';

export interface BeginBody {
	dailyLimit: number;
	concurrentLimit: number;
	/** USD; omit for identifiers without a spend ceiling. */
	spendLimitUsd?: number;
	/** USD held against the spend ceiling until this slot settles. */
	reserveSpendUsd?: number;
}

export interface BeginResult {
	ok: boolean;
	error?: Extract<ErrorCode, 'daily_limit_reached' | 'request_in_progress' | 'spend_limit_reached'>;
	/** Daily requests remaining after this begin. */
	remaining: number;
	/** ISO time the daily window resets (next UTC midnight). */
	resetsAt: string;
	/** Slot token to pass back to /finish or /cancel. */
	slot?: string;
}

export interface FinishBody {
	slot: string;
	/** USD this slot actually cost; booked whether or not the slot is still held. */
	spendUsd?: number;
}

export interface CancelBody {
	slot: string;
}

export interface PeekBody {
	dailyLimit: number;
}

/** Every body the Worker sends to one of this object's four paths. */
export type QuotaRequest = BeginBody | FinishBody | CancelBody | PeekBody;

interface SlotRecord {
	startedAt: number;
	reservedSpendUsd: number;
}

/** A slot written before spend reservations existed is the bare `startedAt` number,
 * and records already on disk are read back in that form. */
type SlotEntry = number | SlotRecord;

function isSlotRecord(entry: SlotEntry): entry is SlotRecord {
	return typeof entry !== 'number';
}

interface DayState {
	day: string;
	count: number;
	spendUsd: number;
	/** In-flight slots and any spend held for them, keyed by slot token. */
	slots: Record<string, SlotEntry>;
}

/** In-flight slots older than this are presumed leaked (a Worker eviction the
 * `finally` never ran through) and are reclaimed rather than pinning the
 * identifier at its concurrency ceiling forever. Two provider timeouts plus a
 * minute of margin: a turn resets that timeout once for the repair retry, so a
 * shorter window reclaims the slot of a request that is still legitimately
 * running and lets the same session start a second one beside it. */
const STALE_SLOT_MS = 5 * 60 * 1000;

function utcDay(now: number): string {
	return new Date(now).toISOString().slice(0, 10);
}

function nextUtcMidnight(now: number): string {
	const date = new Date(now);
	date.setUTCHours(24, 0, 0, 0);
	return date.toISOString();
}

/**
 * The storage operations this object performs. `DurableObjectState['storage']`
 * satisfies it, and so does an in-memory stand-in — which is what lets the test
 * suite exercise the real accounting instead of a re-implementation of it.
 */
export interface QuotaStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	deleteAll(): Promise<void>;
	setAlarm(scheduledTime: number): Promise<void>;
}

/** What Cloudflare hands the constructor, in the one field this object reads. */
export interface QuotaCounterState {
	storage: QuotaStorage;
}

export class QuotaCounter implements DurableObject {
	private readonly storage: QuotaStorage;

	constructor(state: QuotaCounterState) {
		this.storage = state.storage;
	}

	private async load(now: number): Promise<DayState> {
		const stored = await this.storage.get<DayState>('state');
		const day = utcDay(now);
		if (!stored || stored.day !== day) {
			return { day, count: 0, spendUsd: 0, slots: {} };
		}
		for (const [slot, entry] of Object.entries(stored.slots)) {
			const startedAt = isSlotRecord(entry) ? entry.startedAt : entry;
			if (now - startedAt > STALE_SLOT_MS) delete stored.slots[slot];
		}
		return stored;
	}

	private async save(state: DayState): Promise<void> {
		await this.storage.put('state', state);
		// Expire the record after the accounting TTL so nothing about an
		// identifier outlives its usefulness.
		await this.storage.setAlarm(Date.now() + SESSION_RULES.accountingTtlMs);
	}

	async alarm(): Promise<void> {
		await this.storage.deleteAll();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const now = Date.now();
		const state = await this.load(now);

		if (url.pathname === '/begin') {
			// SAFETY: a Durable Object is reachable only through its binding, never from the
			// network, so this body is the `BeginBody` index.ts serialised for this stub call.
			const body = (await request.json()) as BeginBody;
			const resetsAt = nextUtcMidnight(now);
			const respond = (result: BeginResult) => Response.json(result);
			const reservedSpendUsd = Object.values(state.slots).reduce<number>(
				(total, entry) => total + (isSlotRecord(entry) ? Math.max(0, entry.reservedSpendUsd) : 0),
				0
			);
			const requestedReservation = Math.max(0, body.reserveSpendUsd ?? 0);
			if (
				body.spendLimitUsd !== undefined &&
				(state.spendUsd >= body.spendLimitUsd ||
					state.spendUsd + reservedSpendUsd + requestedReservation > body.spendLimitUsd)
			) {
				return respond({
					ok: false,
					error: 'spend_limit_reached',
					remaining: Math.max(0, body.dailyLimit - state.count),
					resetsAt
				});
			}
			if (state.count >= body.dailyLimit) {
				return respond({ ok: false, error: 'daily_limit_reached', remaining: 0, resetsAt });
			}
			if (Object.keys(state.slots).length >= body.concurrentLimit) {
				return respond({
					ok: false,
					error: 'request_in_progress',
					remaining: Math.max(0, body.dailyLimit - state.count),
					resetsAt
				});
			}
			const slot = crypto.randomUUID();
			state.count += 1;
			state.slots[slot] = { startedAt: now, reservedSpendUsd: requestedReservation };
			await this.save(state);
			return respond({
				ok: true,
				remaining: Math.max(0, body.dailyLimit - state.count),
				resetsAt,
				slot
			});
		}

		if (url.pathname === '/finish') {
			// SAFETY: /finish is reached only through this object's binding, carrying the slot
			// token /begin minted for the caller and the spend that call settled at.
			const body = (await request.json()) as FinishBody;
			// Spend is booked whether or not the slot is still here, so releasing
			// the slot is an unconditional delete rather than the arm of a guard.
			// A slot reclaimed as stale, or begun before the UTC day rolled, still
			// cost the money it reports, and it went missing from every ledger.
			state.spendUsd += Math.max(0, body.spendUsd ?? 0);
			delete state.slots[body.slot];
			await this.save(state);
			return Response.json({ ok: true });
		}

		if (url.pathname === '/cancel') {
			// A later layer refused the request: give back the slot AND the count,
			// so a refusal elsewhere never costs this identifier a daily unit.
			// SAFETY: /cancel is reached only through this object's binding, carrying the slot
			// token /begin minted for the caller.
			const body = (await request.json()) as CancelBody;
			if (body.slot in state.slots) {
				delete state.slots[body.slot];
				state.count = Math.max(0, state.count - 1);
			}
			await this.save(state);
			return Response.json({ ok: true });
		}

		if (url.pathname === '/peek') {
			// SAFETY: /peek is reached only through this object's binding, carrying the daily
			// allowance config.ts states for the identifier this object accounts for.
			const body = (await request.json()) as PeekBody;
			return Response.json({
				remaining: Math.max(0, body.dailyLimit - state.count),
				resetsAt: nextUtcMidnight(now)
			});
		}

		return new Response('not found', { status: 404 });
	}
}
