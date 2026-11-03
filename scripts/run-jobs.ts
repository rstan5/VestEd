import { newYorkSessionClock } from "../src/lib/jobs/clock";
import { createFixtureStore } from "../src/lib/jobs/fixture-store";
import { SAMPLE_JOB_NOW, sampleJobSeed } from "../src/lib/jobs/fixtures";
import { runJobsOnce, startJobTimer } from "../src/lib/jobs/run";

// Only the labeled sample store exists until the database store lands; it never reaches a vendor.
const store = createFixtureStore(sampleJobSeed());
const clock = newYorkSessionClock();
const context = () => ({ store, clock, now: new Date(process.env.JOBS_NOW ?? SAMPLE_JOB_NOW) });

const everyFlag = process.argv.indexOf("--every");
const seconds = everyFlag === -1 ? null : Number(process.argv[everyFlag + 1]);

if (seconds === null) {
  runJobsOnce(context()).then((result) => console.log(JSON.stringify({ store: store.label, ...result }, null, 2)));
} else {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--every needs a positive number of seconds");
  const timer = startJobTimer(context, seconds * 1000, {
    onResult: (result) => console.log(JSON.stringify({ store: store.label, ...result })),
  });
  const shutdown = () => void timer.stop().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
