import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database";

// Local reviewer tool. Uses the server-only service role from .env.local, so it is
// never bundled into the app and never runs in a browser.
try {
  process.loadEnvFile(".env.local");
} catch {}

const usage = `Usage:
  npm run campus:review -- list
  npm run campus:review -- club <club-id> official|not_official
  npm run campus:review -- dispute <dispute-id> dismissed|upheld
  npm run campus:review -- affiliation <affiliation-id> verified|rejected`;

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    return 1;
  }
  const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [command, id, decision] = process.argv.slice(2);

  if (command === "list") {
    const { data, error } = await admin.rpc("admin_review_queue");
    if (error) return fail(error.message);
    if (!data?.length) console.log("Nothing waits for review.");
    for (const item of data ?? []) {
      console.log(`${item.kind}\t${item.item_id}\t${item.title}\t${item.detail}\t${item.submitted_at}`);
    }
    return 0;
  }
  if (!id || !decision) return fail(usage);

  const call =
    command === "club"
      ? admin.rpc("review_club", { p_club: id, p_decision: decision })
      : command === "dispute"
        ? admin.rpc("resolve_club_dispute", { p_dispute: id, p_outcome: decision })
        : command === "affiliation"
          ? admin.rpc("decide_university_affiliation", { p_affiliation: id, p_decision: decision })
          : null;
  if (!call) return fail(usage);
  const { data, error } = await call;
  if (error) return fail(error.message);
  console.log(`${command} ${id}: ${data}`);
  return 0;
}

function fail(message: string): number {
  console.error(message);
  return 1;
}

main().then((code) => process.exit(code));
