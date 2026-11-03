import assert from "node:assert/strict";
import { test } from "node:test";
import { campusErrorCode, campusErrorMessage } from "./errors";
import { summarizeCampus } from "./load";
import {
  affiliationLabel,
  campusLine,
  canManageMember,
  clubStatusLabel,
  isOfficial,
  membershipLabel,
  toAffiliationStatus,
  toClubRole,
  toOfficialStatus,
  type Affiliation,
} from "./types";
import { createClubSchema, decisionSchema, disputeSchema, roleSchema, universityEmailSchema } from "./validation";

const pending: Affiliation = {
  id: "x",
  universityId: "michigan",
  universityName: "University of Michigan",
  email: "ada@umich.edu",
  status: "pending",
  submittedAt: "2026-11-03T15:00:00Z",
  decidedAt: null,
};

test("pending and verified affiliations read differently", () => {
  assert.deepEqual(affiliationLabel(null), { text: "Not verified", kind: "unavailable" });
  assert.deepEqual(affiliationLabel(pending), { text: "Verification pending", kind: "provisional" });
  assert.equal(affiliationLabel({ ...pending, status: "verified", decidedAt: "2026-11-04T00:00:00Z" }).text, "Verified · University of Michigan");
  assert.equal(affiliationLabel({ ...pending, status: "rejected" }).text, "Verification declined");
  assert.notEqual(affiliationLabel(pending).text, affiliationLabel({ ...pending, status: "verified" }).text);
});

test("unknown database values fall back to the least privileged reading", () => {
  assert.equal(toAffiliationStatus("verified"), "verified");
  assert.equal(toAffiliationStatus("auto_verified"), "pending");
  assert.equal(toOfficialStatus("official"), "official");
  assert.equal(toOfficialStatus("approved"), "pending_review");
  assert.equal(toClubRole("owner"), "member");
});

test("a club is official only after review and while no dispute is open", () => {
  assert.equal(isOfficial({ officialStatus: "pending_review", underDispute: false }), false);
  assert.equal(isOfficial({ officialStatus: "official", underDispute: false }), true);
  assert.equal(isOfficial({ officialStatus: "official", underDispute: true }), false);
  assert.equal(isOfficial({ officialStatus: "not_official", underDispute: false }), false);
  assert.equal(clubStatusLabel({ officialStatus: "pending_review", underDispute: false }).text, "Not official · pending admin review");
  assert.equal(clubStatusLabel({ officialStatus: "official", underDispute: true }).text, "Disputed · in admin review");
  assert.equal(clubStatusLabel({ officialStatus: "official", underDispute: false }).text, "Official club");
});

test("membership decisions are labeled for the applicant", () => {
  assert.equal(membershipLabel({ status: "pending", role: "member" }).text, "Application pending");
  assert.equal(membershipLabel({ status: "rejected", role: "member" }).text, "Application declined");
  assert.equal(membershipLabel({ status: "active", role: "moderator" }).text, "Moderator");
});

test("leader controls shown in the roster follow the database rules", () => {
  assert.deepEqual(canManageMember("founder", "member"), { remove: true, setRole: true });
  assert.deepEqual(canManageMember("founder", "founder"), { remove: false, setRole: false });
  assert.deepEqual(canManageMember("moderator", "member"), { remove: true, setRole: false });
  assert.deepEqual(canManageMember("moderator", "moderator"), { remove: false, setRole: false });
  assert.deepEqual(canManageMember("member", "member"), { remove: false, setRole: false });
  assert.deepEqual(canManageMember(null, "member"), { remove: false, setRole: false });
});

test("the campus summary separates the active club from past applications", () => {
  const row = (club_id: string, status: string, role = "member") => ({
    club_id,
    club_name: club_id,
    role,
    status,
    applied_at: "2026-11-01T00:00:00Z",
    decided_at: null,
    official_status: "pending_review",
    under_dispute: false,
  });
  const summary = summarizeCampus([], [row("a", "rejected"), row("b", "active", "moderator"), row("c", "pending")]);
  assert.equal(summary.affiliation, null);
  assert.equal(summary.club?.clubId, "b");
  assert.equal(summary.club?.role, "moderator");
  assert.deepEqual(summary.history.map((item) => item.clubId), ["a", "c"]);
  assert.equal(campusLine(summary), "Moderator, b · University not verified");
  assert.equal(campusLine({ affiliation: pending, club: null }), "Individual account · University pending review");
});

test("database error codes become plain messages", () => {
  assert.equal(campusErrorCode({ message: "not_club_leader" }), "not_club_leader");
  assert.equal(campusErrorMessage({ message: "cannot_change_own_role" }, "x"), "You cannot change your own club role.");
  assert.equal(campusErrorMessage({ message: "permission denied for table clubs" }, "fallback"), "fallback");
  assert.equal(campusErrorMessage(null, "fallback"), "fallback");
});

test("campus forms validate shape and never accept an acting user id", () => {
  const email = universityEmailSchema.safeParse({ email: "  Ada@UMich.EDU " });
  assert.equal(email.success && email.data.email, "ada@umich.edu");
  assert.equal(universityEmailSchema.safeParse({ email: "not an email" }).success, false);

  const club = createClubSchema.safeParse({ name: "  Value Fund ", thesis: " ", university: "", founderId: "someone" });
  assert.equal(club.success, true);
  if (club.success) assert.deepEqual(club.data, { name: "Value Fund", thesis: null, university: null });
  assert.equal(createClubSchema.safeParse({ name: "VF", thesis: "", university: "" }).success, false);
  assert.equal(createClubSchema.safeParse({ name: "Value Fund", thesis: "", university: "../x" }).success, false);

  const clubId = "8d3c1f9e-6b1a-4c39-9d1e-2b8a7c6d5e4f";
  const studentId = "5f0c2a1b-3d4e-4f60-8a7b-9c0d1e2f3a4b";
  assert.equal(decisionSchema.safeParse({ clubId, studentId, decision: "approve" }).success, true);
  assert.equal(decisionSchema.safeParse({ clubId, studentId, decision: "promote" }).success, false);
  assert.equal(roleSchema.safeParse({ clubId, studentId, role: "founder" }).success, false, "founder is never assignable");
  assert.equal(roleSchema.safeParse({ clubId: "mia", studentId, role: "moderator" }).success, false);
  assert.equal(disputeSchema.safeParse({ clubId, reason: "short" }).success, false);
});
