import Link from "next/link";
import { percent } from "@/lib/format";
import { universities, universityInvestors, universityStandings } from "@/lib/sample-data";

export default function UniversitiesPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Intercollegiate</div>
        <h1 className="serif text-4xl text-forest">Universities</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">University rank uses eligible individuals, equally weighted. Club assets are not summed, so a large program cannot win by headcount.</p>
      </div>
      <div className="card overflow-x-auto">
        <table>
          <thead><tr><th>Rank</th><th>University</th><th>Conference</th><th className="num">Eligible</th><th className="num">Return</th><th className="num">Score</th></tr></thead>
          <tbody>
            {universityStandings.map((row) => {
              const university = universities.find((item) => item.id === row.universityId)!;
              return (
                <tr key={row.universityId}>
                  <td className="mono">{row.rank}</td>
                  <td><Link href={`/universities/${university.id}`}>{university.name}</Link></td>
                  <td className="text-muted">{university.conference}</td>
                  <td className="num">{row.eligibleInvestors}</td>
                  <td className="num">{percent(row.seasonReturn)}</td>
                  <td className="num">{row.score.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Directory count in the sample is smaller than the eligible-investor field used for fair averages. {universityInvestors("michigan").length} Michigan profiles are expanded in this build.</p>
    </div>
  );
}
