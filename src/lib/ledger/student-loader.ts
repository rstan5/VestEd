import type { StudentLedgerState } from "./client";

/** A ledger state tagged with the profile it was loaded for, so a stale book is never shown under a new account. */
export type KeyedStudentLedger = { profileId: string | null; state: StudentLedgerState };

export type FetchStudentLedger = (signal: AbortSignal) => Promise<StudentLedgerState>;

export type StudentLedgerLoader = {
  /** Switches to a profile (null when signed out) and loads its book. Any earlier request is dropped. */
  select: (profileId: string | null) => Promise<void>;
  /** Reloads the selected profile's book. An overlapping earlier refresh is dropped. */
  refresh: () => Promise<void>;
  /** Drops any request in flight without publishing. */
  cancel: () => void;
};

const MISMATCH_MESSAGE = "The book returned did not belong to the signed-in account. Reload the page.";

export function initialStudentLedger(profileId: string | null): KeyedStudentLedger {
  return { profileId, state: profileId ? { status: "loading" } : { status: "signed-out" } };
}

/** The state to render for the current profile. A state loaded for any other profile reads as loading. */
export function studentLedgerFor(keyed: KeyedStudentLedger, profileId: string | null): StudentLedgerState {
  return keyed.profileId === profileId ? keyed.state : initialStudentLedger(profileId).state;
}

export function createStudentLedgerLoader(fetchLedger: FetchStudentLedger, publish: (value: KeyedStudentLedger) => void): StudentLedgerLoader {
  let current: string | null = null;
  let generation = 0;
  let inFlight: AbortController | null = null;

  function invalidate(): number {
    inFlight?.abort();
    inFlight = null;
    generation += 1;
    return generation;
  }

  async function load(): Promise<void> {
    const profileId = current;
    const ticket = invalidate();
    if (profileId === null) return;
    const controller = new AbortController();
    inFlight = controller;
    let state: StudentLedgerState;
    try {
      state = await fetchLedger(controller.signal);
    } catch {
      state = { status: "unavailable", message: "The ledger could not be reached." };
    }
    if (ticket !== generation || profileId !== current) return;
    inFlight = null;
    if (state.status === "ready" && state.book.studentId !== profileId) {
      state = { status: "unavailable", message: MISMATCH_MESSAGE };
    }
    publish({ profileId, state });
  }

  return {
    select(profileId) {
      current = profileId;
      invalidate();
      publish(initialStudentLedger(profileId));
      return load();
    },
    refresh: load,
    cancel() {
      invalidate();
    },
  };
}
