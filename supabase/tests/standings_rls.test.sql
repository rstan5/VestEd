begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('dddddddd-1111-4111-8111-111111111111', 'standings-owner@example.test', '{"display_name":"Standings Owner"}', 'authenticated', 'authenticated'),
  ('eeeeeeee-2222-4222-8222-222222222222', 'standings-other@example.test', '{"display_name":"Standings Other"}', 'authenticated', 'authenticated');

select public.ledger_create_season('pgtap-st', 'pgTAP standings', '2026-01-05 00:00:00 America/New_York', 1);
select public.ledger_register('dddddddd-1111-4111-8111-111111111111', 'pgtap-st', '2026-01-06T15:00:00Z');
select public.standings_record_valuation(r.id, '2026-01-07T21:00:00Z', 'valued', 100250.00, '{}')
from public.registrations r where r.season_id = 'pgtap-st';

select is(
  public.standings_finalize_round('pgtap-st-r1', '2026-01-26T05:00:00Z',
    '[{"board":"individual","entrant_id":"dddddddd-1111-4111-8111-111111111111","entrant_name":"Standings Owner","rank":1,"return_pct":0.0025,"score":50,"score_label":"Partial","institutional":false,"included":["return"]}]'),
  'finalized',
  'the server role finalizes a closed round'
);
select is(public.standings_finalize_round('pgtap-st-r1', '2026-01-27T05:00:00Z', '[]'), 'already-final', 'a second close does not rewrite the round');
select throws_ok(
  $$ select public.standings_publish('pgtap-st', 'pgtap-st-r1', 'individual', '2026-01-26T05:00:00Z', '[]') $$,
  'P0001', 'round_already_final', 'no provisional version can be published for a final round'
);

create temp table pgtap_final as select id from public.finalized_results where round_id = 'pgtap-st-r1';
grant select on pgtap_final to authenticated, service_role;

-- A student, including the entrant, can read but not change a finalized row ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.finalized_results where round_id = 'pgtap-st-r1'), 1, 'students read finalized results');
select throws_ok($$ update public.finalized_results set rank = 99, return_pct = 0.5 $$, '42501', null, 'a student cannot update a finalized row');
select throws_ok($$ delete from public.finalized_results $$, '42501', null, 'a student cannot delete a finalized row');
select throws_ok(
  $$ insert into public.finalized_results (round_id, season_id, board, entrant_id, entrant_name, rank, finalized_at)
     values ('pgtap-st-r1', 'pgtap-st', 'individual', 'forged', 'Forged', 1, now()) $$,
  '42501', null, 'a student cannot insert a finalized row'
);
select throws_ok($$ insert into public.standing_entries (version_id, entrant_id, entrant_name, rank) values (gen_random_uuid(), 'x', 'x', 1) $$,
  '42501', null, 'a student cannot write a provisional rank');
select throws_ok($$ select public.standings_finalize_round('pgtap-st-r1', now(), '[]') $$, '42501', null, 'a student cannot finalize a round');
select throws_ok($$ select public.standings_publish('pgtap-st', null, 'individual', now(), '[]') $$, '42501', null, 'a student cannot publish standings');
select throws_ok(format('select public.standings_correct_result(%L::uuid, %L::jsonb, %L, now())', (select id from pgtap_final), '{"rank":1}', 'self correction'),
  '42501', null, 'a student cannot correct a result');
select throws_ok($$ select public.standings_record_valuation(gen_random_uuid(), now(), 'valued', 1, '{}') $$, '42501', null, 'a student cannot record a valuation');
select is((select count(*)::int from public.valuation_snapshots where season_id = 'pgtap-st'), 1, 'the owner reads their own valuation snapshot');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.valuation_snapshots where season_id = 'pgtap-st'), 0, 'another student cannot read the snapshot');
select is((select count(*)::int from public.finalized_results where round_id = 'pgtap-st-r1'), 1, 'another student reads the public finalized row');
select throws_ok($$ update public.finalized_results set entrant_name = 'Renamed' $$, '42501', null, 'another student cannot update it');

-- The server role and the table owner cannot rewrite it either ------------------------------
reset role;
set local role service_role;
select throws_ok($$ update public.finalized_results set rank = 2 where round_id = 'pgtap-st-r1' $$, '42501', null, 'the server role cannot update a finalized row');
select throws_ok($$ delete from public.finalized_results where round_id = 'pgtap-st-r1' $$, '42501', null, 'the server role cannot delete a finalized row');

reset role;
select throws_ok($$ update public.finalized_results set rank = 2 where round_id = 'pgtap-st-r1' $$, '42501', 'finalized_rows_are_insert_only', 'the owner cannot update a finalized row');
select throws_ok($$ delete from public.finalized_results where round_id = 'pgtap-st-r1' $$, '42501', 'finalized_rows_are_insert_only', 'the owner cannot delete a finalized row');
select throws_ok($$ truncate public.finalized_results cascade $$, '42501', 'finalized_rows_are_insert_only', 'the owner cannot truncate finalized rows');
select throws_ok($$ delete from public.round_closures where round_id = 'pgtap-st-r1' $$, '42501', 'finalized_rows_are_insert_only', 'a round closure cannot be removed');
select throws_ok($$ delete from public.seasons where id = 'pgtap-st' $$, null, null, 'a season with finalized results cannot be deleted');

select is(
  (select array[rank::text, return_pct::text, entrant_name, edition::text] from public.finalized_results where round_id = 'pgtap-st-r1'),
  array['1', '0.0025', 'Standings Owner', '1'],
  'the original finalized values remain'
);

-- A correction is a new edition ------------------------------------------------------------
set local role service_role;
select isnt(
  public.standings_correct_result((select id from pgtap_final), '{"return_pct":0.0030}', 'Late corporate action', '2026-01-28T05:00:00Z'),
  null,
  'the server role records a correction'
);
reset role;
select is(
  (select array_agg(edition::text || ':' || return_pct::text order by edition) from public.finalized_results where round_id = 'pgtap-st-r1'),
  array['1:0.0025', '2:0.0030'],
  'the correction is edition 2 and edition 1 is unchanged'
);
select is(
  (select supersedes from public.finalized_results where round_id = 'pgtap-st-r1' and edition = 2),
  (select id from pgtap_final),
  'edition 2 supersedes the original row'
);
select is(
  (select array[edition::text, return_pct] from public.current_finalized_results('pgtap-st')),
  array['2', '0.0030'],
  'the current edition is the correction'
);
select throws_ok(
  format('select public.standings_correct_result(%L::uuid, %L::jsonb, %L, now())', (select id from pgtap_final), '{"rank":3}', 'Second fix on old row'),
  'P0001', 'result_already_superseded', 'a superseded edition cannot be corrected again'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.finalized_results $$, '42501', null, 'anon cannot read finalized results');

select * from finish();
rollback;
