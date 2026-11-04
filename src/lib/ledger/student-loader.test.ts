import assert from "node:assert/strict";
import test from "node:test";
import type { BookValuation } from "./book";
import type { StudentLedgerState } from "./client";
import { createStudentLedgerLoader, initialStudentLedger, studentLedgerFor, type KeyedStudentLedger } from "./student-loader";
import type { LedgerBook } from "./types";

function readyFor(studentId: string): StudentLedgerState {
  return { status: "ready", book: { studentId, registrationId: `reg-${studentId}` } as LedgerBook, valuation: {} as BookValuation };
}

/** A fetch whose responses resolve only when the test says so, in any order. */
function deferredFetch() {
  const calls: Array<{ resolve: (state: StudentLedgerState) => void; signal: AbortSignal }> = [];
  const fetchLedger = (signal: AbortSignal) => new Promise<StudentLedgerState>((resolve) => calls.push({ resolve, signal }));
  return { calls, fetchLedger };
}

function harness() {
  const { calls, fetchLedger } = deferredFetch();
  const published: KeyedStudentLedger[] = [];
  let latest: KeyedStudentLedger = initialStudentLedger(null);
  const loader = createStudentLedgerLoader(fetchLedger, (value) => {
    latest = value;
    published.push(value);
  });
  return { calls, loader, published, view: (profileId: string | null) => studentLedgerFor(latest, profileId) };
}

const bookOwner = (state: StudentLedgerState) => (state.status === "ready" ? state.book.studentId : null);

test("switching accounts never shows the previous student's book, even when the old response arrives late", async () => {
  const { calls, loader, published, view } = harness();
  const first = loader.select("student-a");
  assert.equal(view("student-a").status, "loading");
  calls[0].resolve(readyFor("student-a"));
  await first;
  assert.equal(bookOwner(view("student-a")), "student-a");

  const refreshA = loader.refresh();
  const switched = loader.select("student-b");
  assert.equal(view("student-b").status, "loading", "the new account starts loading, not on the old book");
  assert.equal(calls[1].signal.aborted, true, "the obsolete request is aborted");

  calls[2].resolve(readyFor("student-b"));
  await switched;
  calls[1].resolve(readyFor("student-a"));
  await refreshA;
  assert.equal(bookOwner(view("student-b")), "student-b");
  assert.ok(published.every((item) => item.state.status !== "ready" || item.state.book.studentId === item.profileId));
  assert.equal(published.at(-1)?.profileId, "student-b");
});

test("a delayed response for the prior account is dropped before the new account's book arrives", async () => {
  const { calls, loader, view } = harness();
  const first = loader.select("student-a");
  const second = loader.select("student-b");
  calls[0].resolve(readyFor("student-a"));
  await first;
  assert.equal(view("student-b").status, "loading", "the late prior-account book is not shown");
  assert.equal(bookOwner(view("student-b")), null);
  calls[1].resolve(readyFor("student-b"));
  await second;
  assert.equal(bookOwner(view("student-b")), "student-b");
});

test("a state loaded for one profile renders as loading for any other profile", () => {
  const keyed: KeyedStudentLedger = { profileId: "student-a", state: readyFor("student-a") };
  assert.deepEqual(studentLedgerFor(keyed, "student-b"), { status: "loading" });
  assert.deepEqual(studentLedgerFor(keyed, null), { status: "signed-out" });
  assert.equal(bookOwner(studentLedgerFor(keyed, "student-a")), "student-a");
});

test("a response whose book names another student is rejected", async () => {
  const { calls, loader, view } = harness();
  const pending = loader.select("student-b");
  calls[0].resolve(readyFor("student-a"));
  await pending;
  const state = view("student-b");
  assert.equal(state.status, "unavailable");
  assert.equal(bookOwner(state), null);
});

test("signing out drops an in-flight load and shows the signed-out state", async () => {
  const { calls, loader, view } = harness();
  const pending = loader.select("student-a");
  await loader.select(null);
  calls[0].resolve(readyFor("student-a"));
  await pending;
  assert.deepEqual(view(null), { status: "signed-out" });
  assert.equal(calls.length, 1, "no request is made while signed out");
});

test("an overlapping refresh for the same account keeps only the newest response", async () => {
  const { calls, loader, view } = harness();
  const first = loader.select("student-a");
  calls[0].resolve(readyFor("student-a"));
  await first;
  const older = loader.refresh();
  const newer = loader.refresh();
  const fresh = readyFor("student-a");
  calls[2].resolve(fresh);
  await newer;
  calls[1].resolve({ status: "unavailable", message: "stale" });
  await older;
  assert.equal(view("student-a"), fresh);
});
