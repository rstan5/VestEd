import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const readme = readFileSync(join(__dirname, "..", "..", "README.md"), "utf8");

function section(heading: string): string {
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README is missing "${heading}"`);
  const rest = readme.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

test("README says how to run and test, including the browser journeys", () => {
  assert.match(section("## Run locally"), /--hostname 127\.0\.0\.1 --port 3100/);
  const testing = section("## Testing");
  for (const command of ["npm test", "npx supabase test db", "npm run test:e2e", "npx supabase stop"]) assert.ok(testing.includes(command), `Testing omits ${command}`);
  for (const spec of ["signup.spec.ts", "order.spec.ts", "rankings.spec.ts", "a11y.spec.ts"]) assert.ok(testing.includes(spec), `Testing omits ${spec}`);
});

test("README names each blocked integration as blocked", () => {
  const blocked = section("### Blocked");
  for (const item of ["Market license", "Model credential", "Production email", "Previous-year history"]) {
    assert.match(blocked, new RegExp(`\\*\\*${item}\\.\\*\\*`), `${item} is not listed as blocked`);
  }
  assert.match(blocked, /MARKET_DATA_API_KEY/);
  assert.match(blocked, /AI_API_KEY/);
  assert.match(blocked, /Mailpit/);
  assert.match(blocked, /no champions/i);
});

test("README names sample data as sample", () => {
  const sample = section("### Sample");
  for (const item of [/quote/i, /news/i, /Professor replies/, /signed-out Standings/i]) assert.match(sample, item);
});

test("README claims no deploy, live vendor, or previous-year champions", () => {
  assert.match(readme, /Nothing is deployed/);
  const claims = readme.replace(/Nothing is deployed/g, "");
  assert.doesNotMatch(claims, /\b(is|are) (now )?deployed\b|deployed (at|to) |vercel\.app|netlify\.app/i);
  assert.doesNotMatch(claims, /\b(live|real-time|delayed) (quotes|prices|feed) (are|is) (connected|available|enabled)/i);
  assert.doesNotMatch(claims, /archived champions|previous-year champions are/i);
});
