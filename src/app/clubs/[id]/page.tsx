"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, Pill } from "@/components/ui";
import { percent } from "@/lib/format";
import { clubById, clubMembers, clubStandings, investorById, universityById } from "@/lib/sample-data";

export default function ClubPage() {
  const params = useParams<{ id: string }>();
  const club = clubById(params.id);
  const [applied, setApplied] = useState(false);
  const [decision, setDecision] = useState<string | null>(null);
  if (!club) return <EmptyState title="Club not found" body="That organization is not in the sample directory." />;
  const standing = clubStandings.find((row) => row.clubId === club.id);
  const members = clubMembers(club.id);
  const university = universityById(club.universityId);
  const leader = investorById(club.leaderId);

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-primary" href="/clubs">All clubs</Link>
        <h1 className="serif text-4xl text-forest">{club.name}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{club.thesis}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill tone="dark">{club.verified ? "Verified club" : "Unverified"}</Pill>
        <Pill>{university?.name}</Pill>
        <Pill>Founded {club.founded}</Pill>
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Club rank" value={standing ? `#${standing.rank}` : "—"} />
        <Stat label="Season return" value={standing ? percent(standing.seasonReturn) : "—"} />
        <Stat label="Eligible members" value={String(standing?.eligibleMembers ?? members.length)} />
        <Stat label="Score" value={standing ? standing.score.toFixed(1) : "—"} />
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card overflow-hidden">
          <div className="px-4 pt-4"><h2 className="serif text-2xl text-forest">Roster</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td><Link href={`/investors/${member.id}`}>{member.name}</Link></td>
                  <td className="capitalize">{member.role}</td>
                  <td>{member.eligible ? "Eligible" : "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="serif text-2xl text-forest">Membership</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Applications in this prototype are recorded locally on the page. They do not change the frozen roster or the club score.</p>
            <button className="btn mt-3" type="button" onClick={() => setApplied(true)} disabled={applied}>{applied ? "Application noted" : "Apply to join"}</button>
            {applied ? <p className="mt-2 text-sm">A leader would review this before the club lock date. No message was sent.</p> : null}
          </div>
          <div className="card p-4">
            <h2 className="serif text-2xl text-forest">Leader desk</h2>
            <p className="mt-2 text-sm text-muted">Sample controls for {leader?.name}. They do not persist a real approval.</p>
            <div className="mt-3 flex gap-2">
              <button className="btn" type="button" onClick={() => setDecision("Approved in the demo only. Roster unchanged.")}>Approve sample request</button>
              <button className="btn secondary" type="button" onClick={() => setDecision("Rejected in the demo only. Roster unchanged.")}>Reject</button>
            </div>
            {decision ? <p className="mt-2 text-sm">{decision}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div><div className="serif text-3xl text-forest">{value}</div></div>;
}
