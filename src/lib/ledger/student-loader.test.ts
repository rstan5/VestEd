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

/** By default a page that reads the book is mounted, as on Home or Portfolio. */
function harness({ reader = true } = {}) {
  const { calls, fetchLedger } = deferredFetch();
  const published: KeyedStudentLedger[] = [];
  let latest: KeyedStudentLedger = initialStudentLedger(null);
  const loader = createStudentLedgerLoader(fetchLedger, (value) => {
    latest = value;
    published.push(value);
  });
  if (reader) loader.attach();
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

test("first hydration of a page that does not read the book, such as Professor, never requests it", async () => {
  const { calls, loader, view } = harness({ reader: false });
  await loader.select("unregistered-student");
  assert.equal(calls.length, 0, "GET /api/portfolio opens and credits a season book, so it must not be called");
  assert.equal(view("unregistered-student").status, "loading");
  await loader.select("unregistered-student");
  assert.equal(calls.length, 0, "a repeated select for the same profile still makes no request");
});

test("a page that reads the book loads it once, whether it mounts before or after the profile is known", async () => {
  const early = harness({ reader: false });
  const detach = early.loader.attach();
  assert.equal(early.calls.length, 0, "no request without a signed-in profile");
  const pending = early.loader.select("student-a");
  assert.equal(early.calls.length, 1);
  early.calls[0].resolve(readyFor("student-a"));
  await pending;
  detach();
  early.loader.attach();
  assert.equal(early.calls.length, 1, "navigating back to a reader does not reload an already loaded book");
  assert.equal(bookOwner(early.view("student-a")), "student-a");

  const late = harness({ reader: false });
  await late.loader.select("student-b");
  assert.equal(late.calls.length, 0);
  late.loader.attach();
  assert.equal(late.calls.length, 1, "opening Portfolio after Professor loads the book");
  late.calls[0].resolve(readyFor("student-b"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bookOwner(late.view("student-b")), "student-b");
});

test("after every reader detaches, switching accounts requests nothing until a reader mounts again", async () => {
  const { calls, loader } = harness({ reader: false });
  const detach = loader.attach();
  const first = loader.select("student-a");
  calls[0].resolve(readyFor("student-a"));
  await first;
  detach();
  detach();
  await loader.select("student-b");
  assert.equal(calls.length, 1, "a detach called twice does not leave a phantom reader");
});
