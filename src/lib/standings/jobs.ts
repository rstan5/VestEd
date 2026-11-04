import { runJobsOnce, type JobRunResult } from "@/lib/jobs/run";
import { createLedgerFillStore, ledgerSessionClock } from "@/lib/ledger/job-store";
import { createStandingsRoundStore, createStandingsValuationStore, openSeasons, publishProvisional, type PublishResult, type StandingsClient } from "./store";

export type PostgresJobResult = JobRunResult & { standings: PublishResult[] };

/**
 * One pass of every job over the Postgres ledger: fills, valuations, round close, then provisional
 * standings. A local timer, a test, or a hosted scheduled job calls this same function.
 */
export async function runPostgresJobs(
  client: StandingsClient,
  now: Date,
  /** Restricts the pass, for example to one shard of a hosted job or to a test's own season. */
  scope: { seasonIds?: string[]; studentIds?: string[] } = {},
): Promise<PostgresJobResult> {
  const clock = await ledgerSessionClock(client);
  const store = {
    ...createLedgerFillStore(client, { now: () => now, studentIds: scope.studentIds }),
    ...createStandingsValuationStore(client, { now: () => now, seasonIds: scope.seasonIds }),
    ...createStandingsRoundStore(client, { seasonIds: scope.seasonIds }),
  };
  const result = await runJobsOnce({ store, clock, now });
  const standings: PublishResult[] = [];
  for (const seasonId of await openSeasons(client, now, scope.seasonIds)) standings.push(await publishProvisional(client, seasonId, now));
  return { ...result, standings };
}
