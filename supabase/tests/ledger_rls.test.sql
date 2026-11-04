begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'ledger-owner@example.test', '{"display_name":"Ledger Owner"}', 'authenticated', 'authenticated'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'ledger-other@example.test', '{"display_name":"Ledger Other"}', 'authenticated', 'authenticated');

insert into public.instruments (id, name, kind, sector) values
  ('ZPGTAPA', 'pgTAP test stock', 'stock', 'Test'),
  ('ZPGTAPB', 'pgTAP test ETF', 'etf', 'Test');
-- All timestamps sit in the past so valuation quotes (as_of <= now()) are visible.
insert into public.quotes (id, instrument_id, price, as_of, source) values
  ('cccccccc-0000-4000-8000-000000000001', 'ZPGTAPA', 100.00, '2026-11-02T14:00:00Z', 'sample'),
  ('cccccccc-0000-4000-8000-000000000002', 'ZPGTAPA', 100.00, '2026-11-02T15:20:00Z', 'sample'),
  ('cccccccc-0000-4000-8000-000000000003', 'ZPGTAPB', 50.00, '2026-11-02T14:00:00Z', 'sample'),
  ('cccccccc-0000-4000-8000-000000000004', 'ZPGTAPB', 50.00, '2026-11-02T15:20:00Z', 'sample');

-- The owner buys 10 ZPGTAPA and 20 ZPGTAPB, both filled, and leaves one buy open.
select public.ledger_accept_order('aaaaaaaa-1111-4111-8111-111111111111', 'ZPGTAPA', 'buy', 10, 'pgtap-owner-1', '2026-11-02T15:00:00Z');
select public.ledger_accept_order('aaaaaaaa-1111-4111-8111-111111111111', 'ZPGTAPB', 'buy', 20, 'pgtap-owner-2', '2026-11-02T15:00:00Z');
select public.ledger_fill_order(o.id, case o.instrument_id when 'ZPGTAPA' then 'cccccccc-0000-4000-8000-000000000002'::uuid else 'cccccccc-0000-4000-8000-000000000004'::uuid end, '2026-11-02T15:30:00Z')
from public.orders o where o.student_id = 'aaaaaaaa-1111-4111-8111-111111111111';
select public.ledger_accept_order('aaaaaaaa-1111-4111-8111-111111111111', 'ZPGTAPA', 'buy', 1, 'pgtap-owner-3', '2026-11-02T16:00:00Z');
select public.ledger_register('bbbbbbbb-2222-4222-8222-222222222222', null, '2026-11-02T16:00:00Z');

-- Temp table carries the owner's open order id across the role switch, since RLS hides it.
create temp table pgtap_open_order as
select id from public.orders where idempotency_key = 'pgtap-owner-3';
grant select on pgtap_open_order to authenticated;

select is(
  (select cash::text from public.registrations where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'),
  '97999.70',
  'two fills debit price plus one cent per share'
);
select is(
  (select amount::text from public.cash_ledger where student_id = 'bbbbbbbb-2222-4222-8222-222222222222' and kind = 'opening'),
  '100000.00',
  'registration credits exactly the season starting capital'
);

-- Owner ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.registrations), 1, 'owner reads their registration');
select is((select count(*)::int from public.orders), 3, 'owner reads their orders');
select is((select count(*)::int from public.order_reservations), 3, 'owner reads their reservations');
select is((select count(*)::int from public.executions), 2, 'owner reads their executions');
select is((select count(*)::int from public.cash_ledger), 5, 'owner reads their cash activity');
select is((select count(*)::int from public.positions), 2, 'owner reads their positions');
select is((select cash::text from public.registrations), '97999.70', 'owner reads their cash');

update public.profiles set holdings_public = true where id = 'aaaaaaaa-1111-4111-8111-111111111111';

select throws_ok($$ insert into public.orders (registration_id, student_id, instrument_id, side, quantity, idempotency_key, accepted_at, eligible_at, expires_at)
  select r.id, r.student_id, 'ZPGTAPA', 'buy', 1, 'pgtap-forged-1', now(), now() + interval '1 hour', now() + interval '2 hours' from public.registrations r $$,
  '42501', null, 'owner cannot insert an order directly');
select throws_ok($$ update public.registrations set cash = 1000000 $$, '42501', null, 'owner cannot set their cash');
select throws_ok($$ update public.positions set quantity = 1000 $$, '42501', null, 'owner cannot set a position');
select throws_ok($$ delete from public.cash_ledger $$, '42501', null, 'owner cannot delete cash activity');
select throws_ok($$ insert into public.quotes (instrument_id, price, as_of, source) values ('ZPGTAPA', 0.01, now(), 'sample') $$,
  '42501', null, 'owner cannot write a quote');
select throws_ok($$ select public.ledger_accept_order('aaaaaaaa-1111-4111-8111-111111111111', 'ZPGTAPA', 'buy', 1, 'pgtap-clock-1', '2026-11-02T15:00:00Z') $$,
  '42501', null, 'owner cannot call the clocked accept function');
select throws_ok($$ select public.ledger_fill_order(o.id, 'cccccccc-0000-4000-8000-000000000001', now()) from public.orders o $$,
  '42501', null, 'owner cannot fill an order');
select throws_ok($$ select public.ledger_register('aaaaaaaa-1111-4111-8111-111111111111', null, now()) $$,
  '42501', null, 'owner cannot register with an explicit clock');
select throws_ok($$ select * from public.published_holdings_source('aaaaaaaa-1111-4111-8111-111111111111') $$,
  '42501', null, 'owner cannot call the private holdings source');

-- Another student -------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.registrations where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner registration');
select is((select count(*)::int from public.orders where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner orders');
select is((select count(*)::int from public.order_reservations where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner reservations');
select is((select count(*)::int from public.executions where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner executions');
select is((select count(*)::int from public.cash_ledger where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner cash activity');
select is((select count(*)::int from public.positions where student_id = 'aaaaaaaa-1111-4111-8111-111111111111'), 0, 'other student reads no owner positions');
select is((select count(*)::int from public.orders), 0, 'other student sees only their own empty order list');
select is((select count(*)::int from public.cash_ledger), 1, 'other student sees only their own opening line');

select throws_ok(
  format('select public.cancel_order(%L::uuid)', (select id from pgtap_open_order)),
  'P0002', 'order_not_found', 'another student cannot cancel the owner order'
);
select throws_ok(
  $$ select public.cancel_order('00000000-0000-4000-8000-000000000000') $$,
  'P0002', 'order_not_found', 'cancelling an unknown order fails'
);

select is(
  (select array_agg(ticker order by ticker) from public.public_holdings('aaaaaaaa-1111-4111-8111-111111111111')),
  array['ZPGTAPA', 'ZPGTAPB'],
  'published holdings expose tickers from the owner positions'
);
select is(
  (select array_agg(weight order by ticker) from public.public_holdings('aaaaaaaa-1111-4111-8111-111111111111')),
  array[round(1000.00 / 99999.70, 4), round(1000.00 / 99999.70, 4)],
  'published weights are position value over equity at stored quotes'
);

-- Anonymous --------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders');
select throws_ok($$ select * from public.registrations $$, '42501', null, 'anon cannot read registrations');
select throws_ok($$ select public.place_order('ZPGTAPA', 'buy', 1, 'pgtap-anon-1') $$, '42501', null, 'anon cannot place an order');
select throws_ok($$ select * from public.published_holdings_source('aaaaaaaa-1111-4111-8111-111111111111') $$, '42501', null, 'anon cannot call the private holdings source');

-- Grants and shapes ------------------------------------------------------------------------
reset role;

select ok(not has_function_privilege('anon', 'public.published_holdings_source(uuid)', 'execute'), 'anon has no execute on the holdings source');
select ok(not has_function_privilege('authenticated', 'public.published_holdings_source(uuid)', 'execute'), 'authenticated has no execute on the holdings source');
select ok(not has_function_privilege('anon', 'public.ledger_replayed_order(uuid, text, text, text, numeric)', 'execute'), 'anon has no execute on the replay lookup');
select ok(not has_function_privilege('authenticated', 'public.ledger_replayed_order(uuid, text, text, text, numeric)', 'execute'), 'authenticated has no execute on the replay lookup');
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = (select prorettype from pg_proc where oid = 'public.published_holdings_source(uuid)'::regprocedure)
     and attnum > 0),
  null,
  'the holdings source returns a plain table type'
);
select is(
  (select array_agg(a order by n) from unnest(
     (select proargnames from pg_proc where oid = 'public.published_holdings_source(uuid)'::regprocedure)
   ) with ordinality as t(a, n)),
  array['owner', 'ticker', 'weight'],
  'the holdings source returns ticker and weight only'
);
select is(
  (select count(*)::int from public.published_holdings_source('bbbbbbbb-2222-4222-8222-222222222222')),
  0,
  'a student with no positions publishes nothing'
);
select throws_ok(
  $$ insert into public.rounds (id, season_id, number, name, starts_at, ends_at)
     select 'fall-2026-overlap', 'fall-2026', 6, 'Overlap', r.starts_at + interval '1 day',
       ((r.starts_at + interval '1 day') at time zone 'America/New_York' + interval '21 days') at time zone 'America/New_York'
     from public.rounds r where r.id = 'fall-2026-r5' $$,
  null, null, 'a round that overlaps the previous one is refused'
);
select is(
  (select count(*)::int from public.rounds r join public.rounds n on n.season_id = r.season_id and n.number = r.number + 1 where n.starts_at <> r.ends_at),
  0,
  'adjacent rounds meet exactly'
);

select * from finish();
rollback;
