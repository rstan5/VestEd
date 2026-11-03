export type Session = { open: Date; close: Date };

export interface SessionClock {
  /** The first regular session whose close is after `instant`. */
  sessionFor(instant: Date): Session;
}

export const FILL_DELAY_MS = 15 * 60 * 1000;

const TIME_ZONE = "America/New_York";
const REGULAR_OPEN = "09:30";
const REGULAR_CLOSE = "16:00";
const SEARCH_DAYS = 21;

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" });
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

function offsetMinutes(utcMs: number): number {
  const name = offsetFormat.formatToParts(new Date(utcMs)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function parseDateKey(key: string): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number);
  return [year, month, day];
}

function newYorkTime(dateKey: string, time: string): Date {
  const [year, month, day] = parseDateKey(dateKey);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - offsetMinutes(naive) * 60_000;
  return new Date(naive - offsetMinutes(first) * 60_000);
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekday(dateKey: string): number {
  const [year, month, day] = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export type SessionCalendar = {
  /** Exchange holidays as New York dates, `YYYY-MM-DD`. */
  closedDates?: string[];
  /** Early closes as New York date to local close time, `HH:MM`. */
  earlyCloses?: Record<string, string>;
};

/** Regular US equity hours in New York time. Holidays and early closes come from the supplied calendar. */
export function newYorkSessionClock(calendar: SessionCalendar = {}): SessionClock {
  const closed = new Set(calendar.closedDates ?? []);
  const early = calendar.earlyCloses ?? {};
  return {
    sessionFor(instant) {
      const start = dateFormat.format(instant);
      for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
        const key = addDays(start, offset);
        const day = weekday(key);
        if (day === 0 || day === 6 || closed.has(key)) continue;
        const session = { open: newYorkTime(key, REGULAR_OPEN), close: newYorkTime(key, early[key] ?? REGULAR_CLOSE) };
        if (session.close.getTime() > instant.getTime()) return session;
      }
      throw new Error(`No regular session within ${SEARCH_DAYS} days of ${instant.toISOString()}`);
    },
  };
}

/** Eligibility is the later of acceptance plus 15 minutes and the next regular-session open. */
export function eligibleAt(acceptedAt: string | Date, clock: SessionClock): { eligibleAt: Date; session: Session } {
  const candidate = new Date(new Date(acceptedAt).getTime() + FILL_DELAY_MS);
  const session = clock.sessionFor(candidate);
  const eligible = candidate.getTime() > session.open.getTime() ? candidate : session.open;
  return { eligibleAt: eligible, session };
}
