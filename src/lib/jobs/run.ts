import { fillEligibleOrders, type FillJobResult } from "./fill";
import { closeDueRounds, type RoundCloseJobResult } from "./round-close";
import type { JobContext } from "./types";
import { valueAccounts, type ValuationJobResult } from "./valuation";

export type JobRunResult = {
  ranAt: string;
  fill: FillJobResult;
  valuation: ValuationJobResult;
  roundClose: RoundCloseJobResult;
};

/** The single entry point a local timer, a test, or a hosted scheduled job calls. */
export async function runJobsOnce(context: JobContext): Promise<JobRunResult> {
  const fill = await fillEligibleOrders(context);
  const valuation = await valueAccounts(context);
  const roundClose = await closeDueRounds(context);
  return { ranAt: context.now.toISOString(), fill, valuation, roundClose };
}

export type JobTimer = { stop(): Promise<void> };

export type JobTimerHooks = {
  onResult?: (result: JobRunResult) => void;
  onError?: (error: unknown) => void;
};

/** Calls `runJobsOnce` on an interval for local runs. Ticks never overlap. */
export function startJobTimer(
  context: () => JobContext | Promise<JobContext>,
  intervalMs: number,
  hooks: JobTimerHooks = {},
): JobTimer {
  let running: Promise<void> | null = null;
  let stopped = false;

  const tick = () => {
    if (running || stopped) return;
    running = (async () => {
      try {
        const result = await runJobsOnce(await context());
        if (!stopped) hooks.onResult?.(result);
      } catch (error) {
        if (hooks.onError) hooks.onError(error);
        else console.error(error);
      }
    })().finally(() => {
      running = null;
    });
  };

  const handle = setInterval(tick, intervalMs);
  tick();

  return {
    async stop() {
      stopped = true;
      clearInterval(handle);
      await running;
    },
  };
}
