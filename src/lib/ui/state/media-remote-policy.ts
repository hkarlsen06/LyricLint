/** Shared timing and result limits for remote media sources. */
export const remotePollIntervalMs = 250;
export const remoteLoadTimeoutMs = 20_000;
export const remoteSearchLimit = 6;

const settleToleranceSeconds = 1;
const settleMaxPolls = 8;

/** Whether a polled remote seek has landed, or has waited long enough to yield. */
export function remoteSeekSettled(actual: number, target: number, polls: number): boolean {
	return Math.abs(actual - target) <= settleToleranceSeconds || polls >= settleMaxPolls;
}
