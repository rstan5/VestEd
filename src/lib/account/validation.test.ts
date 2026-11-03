import assert from "node:assert/strict";
import { test } from "node:test";
import { initials, firstName } from "./types";
import { onboardingSchema, passwordSchema, privacySchema, profileSchema, signInSchema, signUpSchema } from "./validation";

test("signup trims the name, normalizes the email, and needs 8 characters", () => {
  const ok = signUpSchema.safeParse({ displayName: "  Ada Lovelace ", email: " Ada@Example.EDU ", password: "correct horse" });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.displayName, "Ada Lovelace");
    assert.equal(ok.data.email, "ada@example.edu");
  }
  assert.equal(signUpSchema.safeParse({ displayName: "Ada", email: "ada@example.edu", password: "short" }).success, false);
  assert.equal(signUpSchema.safeParse({ displayName: "   ", email: "ada@example.edu", password: "long enough" }).success, false);
  assert.equal(signUpSchema.safeParse({ displayName: "Ada", email: "not-an-email", password: "long enough" }).success, false);
  assert.equal(signUpSchema.safeParse({ displayName: "x".repeat(61), email: "ada@example.edu", password: "long enough" }).success, false);
});

test("signup ignores any club or verification field the client sends", () => {
  const parsed = signUpSchema.safeParse({ displayName: "Ada", email: "ada@example.edu", password: "long enough", clubId: "mia", verified: true });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(Object.keys(parsed.data).sort(), ["displayName", "email", "password"]);
});

test("login requires both fields", () => {
  assert.equal(signInSchema.safeParse({ email: "ada@example.edu", password: "" }).success, false);
  assert.equal(signInSchema.safeParse({ email: "ada@example.edu", password: "x" }).success, true);
});

test("profile edits accept blank optional fields and reject bad years", () => {
  const blank = profileSchema.safeParse({ displayName: "Ada", classYear: "", concentration: "  " });
  assert.equal(blank.success, true);
  if (blank.success) {
    assert.equal(blank.data.classYear, null);
    assert.equal(blank.data.concentration, null);
  }
  const full = profileSchema.safeParse({ displayName: "Ada", classYear: "2028", concentration: "Economics" });
  assert.equal(full.success, true);
  if (full.success) assert.equal(full.data.classYear, 2028);
  assert.equal(profileSchema.safeParse({ displayName: "Ada", classYear: "28", concentration: "" }).success, false);
  assert.equal(profileSchema.safeParse({ displayName: "Ada", classYear: "20x8", concentration: "" }).success, false);
  assert.equal(profileSchema.safeParse({ displayName: "Ada\u0007", classYear: "", concentration: "" }).success, false);
  assert.equal(profileSchema.safeParse({ id: "someone-else", displayName: "Ada", classYear: "", concentration: "" }).success, true);
});

test("onboarding can finish as an individual without club or university", () => {
  const parsed = onboardingSchema.safeParse({ displayName: "Ada", classYear: "", concentration: "", next: "individual" });
  assert.equal(parsed.success, true);
  assert.equal(onboardingSchema.safeParse({ displayName: "Ada", classYear: "", concentration: "", next: "club" }).success, false);
});

test("publishing holdings needs explicit consent, going private does not", () => {
  assert.equal(privacySchema.safeParse({ holdings: "public", consent: null }).success, false);
  assert.equal(privacySchema.safeParse({ holdings: "public", consent: "yes" }).success, true);
  assert.equal(privacySchema.safeParse({ holdings: "private", consent: null }).success, true);
  assert.equal(privacySchema.safeParse({ holdings: "everyone", consent: "yes" }).success, false);
});

test("password change needs matching passwords", () => {
  assert.equal(passwordSchema.safeParse({ password: "new password", confirm: "new password" }).success, true);
  assert.equal(passwordSchema.safeParse({ password: "new password", confirm: "other password" }).success, false);
});

test("names render as a first name and initials", () => {
  assert.equal(firstName("  Ada  Lovelace "), "Ada");
  assert.equal(initials("Ada King Lovelace"), "AL");
  assert.equal(initials("ada"), "AD");
  assert.equal(firstName(""), "Student");
});
