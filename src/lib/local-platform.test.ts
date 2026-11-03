import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

type Toml = Record<string, Record<string, string>>;

function parseFlatToml(source: string): Toml {
  const sections: Toml = { "": {} };
  let current = "";
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      current = header[1];
      sections[current] ??= {};
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (pair) sections[current][pair[1]] = pair[2].replace(/^"|"$/g, "");
  }
  return sections;
}

const config = parseFlatToml(read("supabase/config.toml"));

test("local Supabase uses the approved ports", () => {
  assert.equal(config[""].project_id, "vested");
  assert.equal(config.api.port, "3130");
  assert.equal(config.db.port, "3131");
  assert.equal(config.db.shadow_port, "3138");
  assert.equal(config.local_smtp.port, "3133");
  assert.equal(config.local_smtp.smtp_port, "3134");
  assert.equal(config.local_smtp.pop3_port, "3135");

  for (const [section, values] of Object.entries(config)) {
    for (const [key, value] of Object.entries(values)) {
      if (!/(^|_)port$/.test(key)) continue;
      const port = Number(value);
      assert.ok(port >= 3130 && port <= 3159, `${section}.${key} = ${value} is outside 3130-3159`);
    }
  }
});

test("heavy and unneeded Supabase services are disabled", () => {
  for (const section of ["studio", "realtime", "analytics", "db.pooler", "edge_runtime"]) {
    assert.equal(config[section]?.enabled, "false", `${section} must be disabled`);
  }
  assert.equal(config["storage.image_transformation"]?.enabled ?? "false", "false");
});

test("Supabase auth redirects to the loopback app", () => {
  assert.equal(config.auth.site_url, "http://127.0.0.1:3100");
  assert.doesNotMatch(read("supabase/config.toml"), /:3000\b/);
});

test("env template leaves every value empty", () => {
  const assignments = read(".env.example")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const names = assignments.map((line) => line.split("=")[0]);

  for (const name of ["MARKET_DATA_API_KEY", "AI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.ok(names.includes(name), `${name} is missing from .env.example`);
  }
  for (const line of assignments) {
    assert.match(line, /^[A-Z0-9_]+=$/, `${line.split("=")[0]} must be empty`);
  }
  assert.ok(
    !names.some((name) => name.startsWith("NEXT_PUBLIC_") && /SERVICE|SECRET|API_KEY/.test(name)),
    "server credentials must not use the NEXT_PUBLIC_ prefix",
  );
});

test(".env.local is ignored by git", () => {
  const ignored = execFileSync("git", ["check-ignore", ".env.local"], { cwd: root, encoding: "utf8" });
  assert.equal(ignored.trim(), ".env.local");
});

test("the repository contains no provider or service-role secret", () => {
  const secretPatterns = [
    "eyJ[A-Za-z0-9_-]{10,}[.]eyJ",
    "sk-[A-Za-z0-9_-]{20,}",
    "sb_secret_[A-Za-z0-9_-]{10,}",
    "(SERVICE_ROLE_KEY|_API_KEY|_SECRET)[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9]",
  ];
  for (const pattern of secretPatterns) {
    let matches = "";
    try {
      matches = execFileSync(
        "git",
        ["grep", "--untracked", "-nIE", pattern, "--", ".", ":!package-lock.json"],
        { cwd: root, encoding: "utf8" },
      );
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
    assert.equal(matches, "", `possible secret matching ${pattern}`);
  }
});

test("the app binds loopback on port 3100", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  for (const name of ["dev", "start"]) {
    assert.match(scripts[name], /--hostname 127\.0\.0\.1\b/, `${name} must bind 127.0.0.1`);
    assert.match(scripts[name], /--port 3100\b/, `${name} must use port 3100`);
  }

  const readme = read("README.md");
  assert.match(readme, /--hostname 127\.0\.0\.1 --port 3100/);
  assert.match(readme, /all interfaces/i);
  assert.match(readme, /3130/);
  assert.doesNotMatch(readme, /localhost:3000|0\.0\.0\.0:3100/);
});
