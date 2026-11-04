import type { ScoreComponentKey } from "@/lib/domain";
import { buildSnapshot, type HoldingWeight, type ValuationPoint } from "@/lib/scoring";

export type BoardKind = "individual" | "club" | "university";

/** Official club and university components need at least this many eligible students. */
export const MIN_GROUP_STUDENTS = 3;

/** One student's inputs for a single window. */
export type StudentWindowInput = {
  id: string;
  name: string;
  /** Registered for the season before the window opened. A late entrant did not participate. */
  participated: boolean;
  /** Verified university affiliation only. A pending or rejected request is null. */
  universityId: string | null;
  /** Active club membership only. */
  clubId: string | null;
  /** Valuation path for the window, base first. Null when the window has no complete valuation. */
  points: ValuationPoint[] | null;
  /** Holdings at the window close. */
  holdings: HoldingWeight[] | null;
  cashWeight: number | null;
};

export type StandingFigures = {
  return: number | null;
  score: number | null;
  riskAdjusted: number | null;
  drawdown: number | null;
  diversification: number | null;
  consistency: number | null;
};

export type IndividualStanding = StandingFigures & {
  entrantId: string;
  name: string;
  universityId: string | null;
  clubId: string | null;
  rank: number | null;
  scoreLabel: "Official" | "Partial" | "Unavailable";
  included: ScoreComponentKey[];
  /** Counts toward university standings (verified affiliation). */
  institutional: boolean;
};

export type GroupComponentKey = keyof StandingFigures;

export const GROUP_COMPONENTS: GroupComponentKey[] = ["return", "score", "riskAdjusted", "drawdown", "diversification", "consistency"];

export type GroupComponent = {
  value: number | null;
  status: "official" | "withheld";
  reason: "too_few_students" | "incomplete_coverage" | null;
  eligible: number;
  covered: number;
};

export type GroupStanding = StandingFigures & {
  entrantId: string;
  name: string;
  universityId: string | null;
  rank: number | null;
  eligibleStudents: number;
  memberIds: string[];
  components: Record<GroupComponentKey, GroupComponent>;
  withheld: GroupComponentKey[];
};

export type Standings = {
  individual: IndividualStanding[];
  club: GroupStanding[];
  university: GroupStanding[];
};

/**
 * Equal-weight mean of one component across a group's eligible students. Every eligible student
 * must have a value: a missing member withholds the component rather than being dropped.
 */
export function groupComponent(values: Array<number | null>): GroupComponent {
  const eligible = values.length;
  const present = values.filter((value): value is number => value !== null);
  const covered = present.length;
  if (eligible < MIN_GROUP_STUDENTS) return { value: null, status: "withheld", reason: "too_few_students", eligible, covered };
  if (covered < eligible) return { value: null, status: "withheld", reason: "incomplete_coverage", eligible, covered };
  return { value: equalWeightMean(present), status: "official", reason: null, eligible, covered };
}

/**
 * Plain mean, rounded to 10 decimal places so the order of summation cannot separate two groups whose
 * students have identical results.
 */
export function equalWeightMean(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(mean.toFixed(10));
}

/** Standard competition ranking, best first. Equal values share a rank. Missing values are unranked. */
export function officialRanks(values: Array<number | null>, direction: "higher" | "lower" = "higher"): Array<number | null> {
  return values.map((value) => {
    if (value === null) return null;
    const better = values.filter((other) => other !== null && (direction === "higher" ? other > value : other < value)).length;
    return better + 1;
  });
}

function dedupe(students: StudentWindowInput[]): StudentWindowInput[] {
  const seen = new Map<string, StudentWindowInput>();
  for (const student of students) if (!seen.has(student.id)) seen.set(student.id, student);
  return [...seen.values()];
}

type Raw = { student: StudentWindowInput; returnPct: number | null; riskAdjusted: number | null; drawdown: number | null; relative: number | null };

function snapshotFor(student: StudentWindowInput, field: Raw[]) {
  return buildSnapshot({
    points: student.points ?? [],
    // Benchmark-relative statistics stay unavailable until a licensed total-return series exists.
    benchmark: null,
    holdings: student.points ? student.holdings : null,
    cashWeight: student.cashWeight ?? 0,
    rounds: [],
    field: {
      returns: field.map((item) => item.returnPct),
      risk: field.map((item) => item.riskAdjusted),
      drawdown: field.map((item) => item.drawdown),
      relative: field.map((item) => item.relative),
    },
  });
}

/** Individual board: every participating student, ranked by window return. Percentiles use the other entrants on this board. */
export function individualStandings(input: StudentWindowInput[]): IndividualStanding[] {
  const students = dedupe(input).filter((student) => student.participated);
  const raw: Raw[] = students.map((student) => {
    const snapshot = snapshotFor(student, []);
    return { student, returnPct: snapshot.returnPct, riskAdjusted: snapshot.riskAdjusted, drawdown: snapshot.drawdown, relative: snapshot.relative };
  });
  const rows = raw.map((entry) => {
    const snapshot = snapshotFor(entry.student, raw.filter((other) => other !== entry));
    return {
      entrantId: entry.student.id,
      name: entry.student.name,
      universityId: entry.student.universityId,
      clubId: entry.student.clubId,
      return: snapshot.returnPct,
      score: snapshot.score,
      scoreLabel: snapshot.scoreLabel,
      included: snapshot.included,
      riskAdjusted: snapshot.riskAdjusted,
      drawdown: snapshot.drawdown,
      diversification: snapshot.diversification,
      consistency: snapshot.consistency,
      institutional: entry.student.universityId !== null,
      rank: null as number | null,
    };
  });
  const ranks = officialRanks(rows.map((row) => row.return));
  rows.forEach((row, index) => (row.rank = ranks[index]));
  return sortByRank(rows);
}

/**
 * Equal-weight group board. Each eligible student counts once, whatever their book size, and the
 * group figure is the plain mean of those students' figures.
 */
export function groupStandings(
  individuals: IndividualStanding[],
  groups: Array<{ id: string; name: string; universityId: string | null }>,
  membership: (row: IndividualStanding) => string | null,
): GroupStanding[] {
  const members = new Map<string, IndividualStanding[]>();
  const counted = new Set<string>();
  for (const row of individuals) {
    const groupId = membership(row);
    if (!groupId || counted.has(row.entrantId)) continue;
    counted.add(row.entrantId);
    members.set(groupId, [...(members.get(groupId) ?? []), row]);
  }
  const rows: GroupStanding[] = groups.flatMap((group) => {
    const list = members.get(group.id) ?? [];
    if (list.length === 0) return [];
    const components = Object.fromEntries(
      GROUP_COMPONENTS.map((key) => [key, groupComponent(list.map((row) => row[key]))]),
    ) as Record<GroupComponentKey, GroupComponent>;
    return [
      {
        entrantId: group.id,
        name: group.name,
        universityId: group.universityId,
        rank: null,
        eligibleStudents: list.length,
        memberIds: list.map((row) => row.entrantId),
        components,
        withheld: GROUP_COMPONENTS.filter((key) => components[key].status === "withheld"),
        return: components.return.value,
        score: components.score.value,
        riskAdjusted: components.riskAdjusted.value,
        drawdown: components.drawdown.value,
        diversification: components.diversification.value,
        consistency: components.consistency.value,
      },
    ];
  });
  const ranks = officialRanks(rows.map((row) => row.return));
  rows.forEach((row, index) => (row.rank = ranks[index]));
  return sortByRank(rows);
}

/**
 * All three boards for one window. Club figures use active members with a verified affiliation.
 * University figures use every verified student, including independents, once each.
 */
export function computeStandings(
  students: StudentWindowInput[],
  directory: { clubs: Array<{ id: string; name: string; universityId: string | null }>; universities: Array<{ id: string; name: string }> },
): Standings {
  const individual = individualStandings(students);
  return {
    individual,
    club: groupStandings(individual, directory.clubs, (row) => (row.institutional ? row.clubId : null)),
    university: groupStandings(
      individual,
      directory.universities.map((item) => ({ ...item, universityId: item.id })),
      (row) => row.universityId,
    ),
  };
}

function sortByRank<T extends { rank: number | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.rank === null && b.rank === null) return a.name.localeCompare(b.name);
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank || a.name.localeCompare(b.name);
  });
}
