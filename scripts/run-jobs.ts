import { createClient } from "@supabase/supabase-js";
import { newYorkSessionClock } from "../src/lib/jobs/clock";
import { createFixtureStore } from "../src/lib/jobs/fixture-store";
import { SAMPLE_JOB_NOW, sampleJobSeed } from "../src/lib/jobs/fixtures";
import { runJobsOnce, startJobTimer } from "../src/lib/jobs/run";
import { runPostgresJobs } from "../src/lib/standings/jobs";
import type { Database } from "../src/lib/supabase/database";

try {
  process.loadEnvFile(".env.local");
} catch {}

const storeFlag = process.argv.indexOf("--store");
const storeName = storeFlag === -1 ? "fixture" : (process.argv[storeFlag + 1] ?? "fixture");
const everyFlag = process.argv.indexOf("--every");
const seconds = everyFlag === -1 ? null : Number(process.argv[everyFlag + 1]);
const seasonFlag = process.argv.indexOf("--season");
const seasonIds = seasonFlag === -1 ? undefined : (process.argv[seasonFlag + 1] ?? "").split(",").filter(Boolean);

if (seasonIds && seasonIds.length === 0) throw new Error("--season needs one or more comma-separated season ids");
if (seconds !== null && (!Number.isFinite(seconds) || seconds <= 0)) {
  throw new Error("--every needs a positive number of seconds");
}

async function main() {
  if (storeName === "postgres") {
    // Fills, valuations, round close, and provisional standings over the Postgres ledger. A round
    // close is permanent, so --season limits valuation, close, and publish to the named seasons.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) {
      throw new Error("--store postgres needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    }
    const client = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = () => (process.env.JOBS_NOW ? new Date(process.env.JOBS_NOW) : new Date());
    const pass = async () => {
      const result = await runPostgresJobs(client, now(), { seasonIds });
      console.log(JSON.stringify({ store: "postgres", ...result }, null, 2));
    };
    if (seconds === null) {
      await pass();
      return;
    }
    const handle = setInterval(() => void pass().catch((error) => console.error(error)), seconds * 1000);
    await pass();
    const shutdown = () => {
      clearInterval(handle);
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }
  if (storeName !== "fixture") throw new Error(`Unknown store "${storeName}". Use fixture or postgres.`);

  // The labeled sample store never reaches a vendor.
  const store = createFixtureStore(sampleJobSeed());
  const clock = newYorkSessionClock();
  const context = () => ({ store, clock, now: new Date(process.env.JOBS_NOW ?? SAMPLE_JOB_NOW) });

  if (seconds === null) {
    const result = await runJobsOnce(context());
    console.log(JSON.stringify({ store: store.label, ...result }, null, 2));
    return;
  }
  const timer = startJobTimer(context, seconds * 1000, {
    onResult: (result) => console.log(JSON.stringify({ store: store.label, ...result })),
  });
  const shutdown = () => void timer.stop().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
