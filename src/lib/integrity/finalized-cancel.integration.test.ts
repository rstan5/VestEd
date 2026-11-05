import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// A finalized row can never be deleted, so this case runs inside one transaction on the local
// database and rolls it back. It drives the real ledger and standings functions, with the cancel
// made by the student role through public.cancel_order. Skipped, never passed, when the stack is down.
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync("supabase/config.toml", "utf8"))?.[1] ?? "vested";
const container = `supabase_db_${projectId}`;

function containerReason(): string | false {
  try {
    const running = execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return running === "true" ? false : `${container} is not running`;
  } catch {
    return `${container} is not running`;
  }
}

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const STUDENT = "f1f1f1f1-0001-4001-8001-0000000000c8";
const SEASON = "zfc-cancel-final";
const R1 = `${SEASON}-r1`;
const R2 = `${SEASON}-r2`;
const finalRow = (rank: number, returnPct: number) =>
  JSON.stringify([{ board: "individual", entrant_id: STUDENT, entrant_name: "Final Cancel", rank, return_pct: returnPct, score_label: "Partial", institutional: false, included: ["return"] }]);

const SCRIPT = `
begin;
create temp table cross_out (label text primary key, value jsonb);
grant select, insert on cross_out to authenticated;

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('${STUDENT}', 'final-cancel@example.test', '{"display_name":"Final Cancel"}', 'authenticated', 'authenticated');
select public.ledger_create_season('${SEASON}', 'Finalized cancel test', '2026-01-05 00:00:00 America/New_York', 2);
insert into public.instruments (id, name, kind, sector) values ('ZFCTEST', 'Finalized cancel stock', 'stock', 'Test');
insert into public.quotes (id, instrument_id, price, as_of, source) values
  ('f2f2f2f2-0000-4000-8000-0000000000c1', 'ZFCTEST', 40.00, '2026-01-06T14:00:00Z', 'sample'),
  ('f2f2f2f2-0000-4000-8000-0000000000c2', 'ZFCTEST', 40.00, '2026-01-06T15:20:00Z', 'sample'),
  ('f2f2f2f2-0000-4000-8000-0000000000c3', 'ZFCTEST', 41.00, '2026-01-27T15:30:00Z', 'sample');

-- Round 1: one filled buy, a valuation, and the finalized result the round close wrote.
select public.ledger_accept_order('${STUDENT}', 'ZFCTEST', 'buy', 5, 'zfc-round-one', '2026-01-06T15:00:00Z');
select public.ledger_fill_order(o.id, 'f2f2f2f2-0000-4000-8000-0000000000c2', '2026-01-06T15:30:00Z')
from public.orders o where o.idempotency_key = 'zfc-round-one';
select public.standings_record_valuation(r.id, '2026-01-23T21:00:00Z', 'valued', 99999.95, '{}')
from public.registrations r where r.season_id = '${SEASON}';
insert into cross_out select 'close_r1', to_jsonb(public.standings_finalize_round('${R1}', '2026-01-26T05:00:00Z', '${finalRow(1, -0.0000005)}'));
insert into cross_out select 'final_before', jsonb_agg(to_jsonb(f) order by f.board, f.entrant_id, f.edition) from public.finalized_results f where f.round_id = '${R1}';

-- Round 2: a buy accepted after the close and still unfilled.
insert into cross_out select 'accepted', public.ledger_accept_order('${STUDENT}', 'ZFCTEST', 'buy', 3, 'zfc-round-two', '2026-01-27T15:00:00Z');
create temp table zfc_order as select id from public.orders where idempotency_key = 'zfc-round-two';
grant select on zfc_order to authenticated;
create temp view zfc_book as
  select jsonb_build_object(
    'cash', (select r.cash::text from public.registrations r where r.student_id = '${STUDENT}'),
    'heldCash', (select coalesce(sum(x.amount), 0)::text from public.order_reservations x where x.student_id = '${STUDENT}' and x.kind = 'cash' and x.released_at is null),
    'orderStatus', (select o.status from public.orders o where o.id = (select id from zfc_order)),
    'reservations', (select jsonb_agg(jsonb_build_object('amount', x.amount::text, 'held', x.released_at is null, 'reason', x.release_reason, 'releasedAt', x.released_at) order by x.held_at)
                     from public.order_reservations x where x.order_id = (select id from zfc_order)),
    'executions', (select count(*) from public.executions e where e.order_id = (select id from zfc_order))
  ) as book;
insert into cross_out select 'book_before_cancel', book from zfc_book;

-- The student cancels through the client RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${STUDENT}","role":"authenticated"}', true);
insert into cross_out select 'cancel', public.cancel_order((select id from zfc_order));
do $$
begin
  perform public.cancel_order((select id from zfc_order));
  insert into cross_out values ('recancel', '"no error"');
exception when others then
  insert into cross_out values ('recancel', to_jsonb(sqlerrm));
end $$;
reset role;
insert into cross_out select 'book_after_cancel', book from zfc_book;

-- Everything that could bring the reserve back or rewrite round 1.
insert into cross_out select 'replay', public.ledger_accept_order('${STUDENT}', 'ZFCTEST', 'buy', 3, 'zfc-round-two', '2026-01-27T16:00:00Z');
insert into cross_out select 'fill_after_cancel', public.ledger_fill_order((select id from zfc_order), 'f2f2f2f2-0000-4000-8000-0000000000c3', '2026-01-27T15:40:00Z');
insert into cross_out select 'expire_after_cancel', to_jsonb(public.ledger_expire_order((select id from zfc_order), '2026-01-27T21:00:00Z'));
select public.standings_record_valuation(r.id, '2026-01-27T21:00:00Z', 'valued', 100004.95, '{}')
from public.registrations r where r.season_id = '${SEASON}';
insert into cross_out select 'reclose_r1', to_jsonb(public.standings_finalize_round('${R1}', '2026-01-28T05:00:00Z', '${finalRow(1, 0.5)}'));
do $$
begin
  perform public.standings_publish('${SEASON}', '${R1}', 'individual', '2026-01-28T05:00:00Z', '${finalRow(1, 0.5)}');
  insert into cross_out values ('publish_r1', '"no error"');
exception when others then
  insert into cross_out values ('publish_r1', to_jsonb(sqlerrm));
end $$;
insert into cross_out select 'close_r2', to_jsonb(public.standings_finalize_round('${R2}', '2026-02-16T05:00:00Z', '${finalRow(1, 0.00005)}'));
insert into cross_out select 'book_final', book from zfc_book;
insert into cross_out select 'final_after', jsonb_agg(to_jsonb(f) order by f.board, f.entrant_id, f.edition) from public.finalized_results f where f.round_id = '${R1}';

select 'CROSS' || chr(9) || label || chr(9) || value::text from cross_out;
rollback;
`;

describe("cancel after a finalized round against local Postgres", () => {
  const skip = containerReason();

  it("canceling an unfilled order releases its reserve once and leaves the finalized result unchanged", (t) => {
    if (skip) return t.skip(skip);
    const out = Object.fromEntries(
      psql(SCRIPT)
        .split("\n")
        .filter((line) => line.startsWith("CROSS\t"))
        .map((line) => {
          const [, label, value] = line.split("\t");
          return [label, JSON.parse(value)];
        }),
    );

    assert.equal(out.close_r1, "finalized");
    assert.equal(out.final_before.length, 1);
    assert.equal(out.final_before[0].rank, 1);
    assert.equal(out.final_before[0].edition, 1);

    assert.equal(out.accepted.status, "accepted");
    assert.deepEqual(out.book_before_cancel, {
      cash: "99799.95",
      heldCash: out.accepted.reservation.amount,
      orderStatus: "accepted",
      reservations: [{ amount: out.accepted.reservation.amount, held: true, reason: null, releasedAt: null }],
      executions: 0,
    });

    assert.equal(out.cancel.status, "cancelled");
    assert.equal(out.cancel.reservation.held, false);
    assert.equal(out.cancel.reservation.release_reason, "cancelled");
    assert.equal(out.recancel, "order_not_open", "a second cancel is refused");
    const released = out.book_after_cancel;
    assert.equal(released.cash, "99799.95", "cancel moves no cash");
    assert.equal(released.heldCash, "0", "the reserve is released");
    assert.equal(released.orderStatus, "cancelled");
    assert.equal(released.reservations.length, 1);
    assert.equal(released.reservations[0].held, false);
    assert.equal(released.reservations[0].reason, "cancelled");

    assert.equal(out.replay.id, out.accepted.id, "replaying the key returns the cancelled order");
    assert.equal(out.replay.status, "cancelled");
    assert.equal(out.replay.replayed, true);
    assert.deepEqual(out.fill_after_cancel, { status: "skipped", reason: "order_not_open" });
    assert.equal(out.expire_after_cancel, false);
    assert.deepEqual(out.book_final, released, "no fill, expiry, or replay recreated the reserve");

    assert.equal(out.reclose_r1, "already-final", "a second round close does not rewrite round 1");
    assert.equal(out.publish_r1, "round_already_final", "no provisional version can replace the finalized round");
    assert.equal(out.close_r2, "finalized", "the next round still closes normally");
    assert.deepEqual(out.final_after, out.final_before, "the round 1 finalized row is unchanged");
  });

  it("leaves nothing behind after the rollback", (t) => {
    if (skip) return t.skip(skip);
    const residue = psql(`select count(*) from public.seasons where id = '${SEASON}'; select count(*) from auth.users where id = '${STUDENT}';`);
    assert.deepEqual(residue.trim().split("\n"), ["0", "0"]);
  });
});
