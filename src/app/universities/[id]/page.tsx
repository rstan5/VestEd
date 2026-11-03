import Link from "next/link";
import { notFound } from "next/navigation";
import { percent } from "@/lib/format";
import { clubs, investorById, universityById, universityInvestors, universityStandings } from "@/lib/sample-data";

export default async function UniversityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const university = universityById(id);
  if (!university) notFound();
  const standing = universityStandings.find((row) => row.universityId === university.id);
  const campusClubs = clubs.filter((club) => club.universityId === university.id);
  const people = universityInvestors(university.id);

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-primary" href="/universities">All universities</Link>
        <h1 className="serif text-4xl text-forest">{university.name}</h1>
        <p className="mt-1 text-sm text-muted">{university.city} · {university.conference}</p>
      </div>
      <section className="grid gap-3 md:grid-cols-3">
        <Stat label="University rank" value={standing ? `#${standing.rank}` : "—"} />
        <Stat label="Equal-weight return" value={standing ? percent(standing.seasonReturn) : "—"} />
        <Stat label="Eligible investors" value={String(standing?.eligibleInvestors ?? 0)} />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="serif text-2xl text-forest">Clubs</h2>
          <ul className="mt-3 space-y-2">
            {campusClubs.map((club) => <li key={club.id}><Link className="text-primary" href={`/clubs/${club.id}`}>{club.name}</Link></li>)}
            {campusClubs.length === 0 ? <li className="text-sm text-muted">No verified club in the sample.</li> : null}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="serif text-2xl text-forest">Sample investors</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {people.map((person) => (
              <li key={person.id} className="flex justify-between gap-3">
                <Link href={`/investors/${person.id}`}>{investorById(person.id)?.name}</Link>
                <span className="text-muted">{person.eligible ? "Eligible" : "Pending"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div><div className="serif text-3xl text-forest">{value}</div></div>;
}
