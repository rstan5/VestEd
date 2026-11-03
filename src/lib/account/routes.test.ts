import assert from "node:assert/strict";
import { test } from "node:test";
import { isProtectedPath, routeDecision, safeNext } from "./routes";

test("personal pages require a session", () => {
  for (const path of ["/", "/portfolio", "/onboarding", "/account/profile", "/account/privacy", "/students/abc", "/campus", "/campus/clubs/abc"]) {
    assert.equal(isProtectedPath(path), true, path);
  }
  for (const path of ["/login", "/signup", "/markets", "/competition", "/clubs", "/portfolios"]) {
    assert.equal(isProtectedPath(path), false, path);
  }
});

test("a signed-out visitor is sent to login with the page they wanted", () => {
  assert.deepEqual(routeDecision("/", "", false), { kind: "redirect", to: "/login" });
  assert.deepEqual(routeDecision("/account/privacy", "?tab=1", false), {
    kind: "redirect",
    to: `/login?next=${encodeURIComponent("/account/privacy?tab=1")}`,
  });
  assert.deepEqual(routeDecision("/markets", "", false), { kind: "next" });
});

test("a signed-in student skips the login and signup pages", () => {
  assert.deepEqual(routeDecision("/login", "", true), { kind: "redirect", to: "/" });
  assert.deepEqual(routeDecision("/login", "?next=%2Fportfolio", true), { kind: "redirect", to: "/portfolio" });
  assert.deepEqual(routeDecision("/signup", "", true), { kind: "redirect", to: "/" });
  assert.deepEqual(routeDecision("/portfolio", "", true), { kind: "next" });
});

test("next targets stay on this site", () => {
  assert.equal(safeNext("/portfolio?tab=orders"), "/portfolio?tab=orders");
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "portfolio", "/login", "/signup?x=1", null, 42, "/a\nb"]) {
    assert.equal(safeNext(value), "/", String(value));
  }
});
