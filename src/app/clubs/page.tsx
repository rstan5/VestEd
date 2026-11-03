import Link from "next/link";
import { clubMembers, clubStandings, clubs, universityById } from "@/lib/sample-data";
import { percent } from "@/lib/format";

export default function ClubsPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Organizations</div>
        <h1 className="serif text-4xl text-forest">Investment clubs</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Club scores are equal-weighted averages of eligible members. A larger roster does not add extra capital to the ranking.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {clubs.map((club) => {
          const standing = clubStandings.find((row) => row.clubId === club.id);
          return (
            <Link key={club.id} href={`/clubs/${club.id}`} className="card p-4 hover:border-sage">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="serif text-2xl text-forest">{club.name}</h2>
                  <p className="text-sm text-muted">{universityById(club.universityId)?.shortName} · est. {club.founded}</p>
                </div>
                <span className="mono text-forest">#{standing?.rank}</span>
              </div>
              <p className="mt-3 text-sm leading-6">{club.thesis}</p>
              <p className="mt-3 text-xs text-muted">{clubMembers(club.id).length} sample members · {standing ? percent(standing.seasonReturn) : "—"} season</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
