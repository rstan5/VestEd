-- Cross-feature isolation: a club leader's role does not open a member's private book, public
-- campus facts render independently, and a signed-out caller reaches no private book or projection.
begin;
create extension if not exists pgtap with schema extensions;

select plan(52);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a1a1a1a1-0001-4001-8001-000000000001', 'cross-founder@example.test', '{"display_name":"Cross Founder"}', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0002-4002-8002-000000000002', 'cross-moderator@example.test', '{"display_name":"Cross Moderator"}', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0003-4003-8003-000000000003', 'cross-member@example.test', '{"display_name":"Cross Member"}', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0004-4004-8004-000000000004', 'cross-verified@example.test', '{"display_name":"Cross Verified"}', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0005-4005-8005-000000000005', 'cross-pending@example.test', '{"display_name":"Cross Pending"}', 'authenticated', 'authenticated');

select public.ledger_create_season('pgtap-cross', 'pgTAP cross', '2026-01-05 00:00:00 America/New_York', 1);

insert into public.instruments (id, name, kind, sector) values ('ZXCROSS', 'pgTAP cross stock', 'stock', 'Test');
insert into public.quotes (id, instrument_id, price, as_of, source) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'ZXCROSS', 40.00, '2026-01-06T14:00:00Z', 'sample'),
  ('c1c1c1c1-0000-4000-8000-000000000002', 'ZXCROSS', 40.00, '2026-01-06T15:20:00Z', 'sample');

insert into public.clubs (id, name, university_id, official_status)
values ('c2c2c2c2-0000-4000-8000-000000000001', 'pgTAP Cross Club', 'michigan', 'official');
insert into public.club_memberships (club_id, student_id, role, status, decided_at) values
  ('c2c2c2c2-0000-4000-8000-000000000001', 'a1a1a1a1-0001-4001-8001-000000000001', 'founder', 'active', '2026-01-02T00:00:00Z'),
  ('c2c2c2c2-0000-4000-8000-000000000001', 'a1a1a1a1-0002-4002-8002-000000000002', 'moderator', 'active', '2026-01-02T00:00:00Z'),
  ('c2c2c2c2-0000-4000-8000-000000000001', 'a1a1a1a1-0003-4003-8003-000000000003', 'member', 'active', '2026-01-02T00:00:00Z'),
  ('c2c2c2c2-0000-4000-8000-000000000001', 'a1a1a1a1-0005-4005-8005-000000000005', 'member', 'active', '2026-01-02T00:00:00Z');
insert into public.university_affiliations (student_id, university_id, email, status, decided_at) values
  ('a1a1a1a1-0003-4003-8003-000000000003', 'michigan', 'cross-member@umich.edu', 'verified', '2026-01-02T00:00:00Z'),
  ('a1a1a1a1-0004-4004-8004-000000000004', 'michigan', 'cross-verified@umich.edu', 'verified', '2026-01-02T00:00:00Z'),
  ('a1a1a1a1-0005-4005-8005-000000000005', 'michigan', 'cross-pending@umich.edu', 'pending', null);

-- The member buys 5 shares (filled) and leaves a second buy open. Both leaders have their own books.
select public.ledger_accept_order('a1a1a1a1-0003-4003-8003-000000000003', 'ZXCROSS', 'buy', 5, 'pgtap-cross-fill', '2026-01-06T15:00:00Z');
select public.ledger_fill_order(o.id, 'c1c1c1c1-0000-4000-8000-000000000002', '2026-01-06T15:30:00Z')
from public.orders o where o.idempotency_key = 'pgtap-cross-fill';
select public.ledger_accept_order('a1a1a1a1-0003-4003-8003-000000000003', 'ZXCROSS', 'buy', 2, 'pgtap-cross-open', '2026-01-06T16:00:00Z');
select public.ledger_register('a1a1a1a1-0001-4001-8001-000000000001', 'pgtap-cross', '2026-01-06T14:00:00Z');
select public.ledger_register('a1a1a1a1-0002-4002-8002-000000000002', 'pgtap-cross', '2026-01-06T14:00:00Z');
select public.standings_record_valuation(r.id, '2026-01-06T21:00:00Z', 'valued', 99999.75, '{}')
from public.registrations r where r.season_id = 'pgtap-cross';

-- The club's public standing, as the standings job would publish it.
select public.standings_publish('pgtap-cross', null, 'club', '2026-01-06T21:00:00Z',
  '[{"entrant_id":"c2c2c2c2-0000-4000-8000-000000000001","entrant_name":"pgTAP Cross Club","university_id":"michigan","club_id":"c2c2c2c2-0000-4000-8000-000000000001","rank":1,"return_pct":-0.0000025,"eligible_students":3,"withheld":[],"included":[]}]');
select public.standings_publish('pgtap-cross', null, 'individual', '2026-01-06T21:00:00Z',
  '[{"entrant_id":"a1a1a1a1-0003-4003-8003-000000000003","entrant_name":"Cross Member","university_id":"michigan","club_id":"c2c2c2c2-0000-4000-8000-000000000001","rank":1,"return_pct":-0.0000025,"score_label":"Partial","institutional":true,"withheld":[],"included":["return"]}]');

create temp table pgtap_cross_open as select id from public.orders where idempotency_key = 'pgtap-cross-open';
grant select on pgtap_cross_open to authenticated;

select is((select status from public.orders where idempotency_key = 'pgtap-cross-fill'), 'filled', 'fixture: the member fill settled');
select is((select holdings_public from public.profiles where id = 'a1a1a1a1-0003-4003-8003-000000000003'), false, 'fixture: the member keeps the private default');

-- The member reads their own book -------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0003-4003-8003-000000000003","role":"authenticated"}', true);

select is((select count(*)::int from public.registrations where season_id = 'pgtap-cross'), 1, 'member reads their registration');
select is((select count(*)::int from public.orders), 2, 'member reads their orders');
select is((select count(*)::int from public.order_reservations), 2, 'member reads their reservations');
select is((select count(*)::int from public.executions), 1, 'member reads their execution');
select is((select count(*)::int from public.cash_ledger), 3, 'member reads their cash activity');
select is((select quantity::text from public.positions where instrument_id = 'ZXCROSS'), '5', 'member reads their position');
select is((select count(*)::int from public.valuation_snapshots), 1, 'member reads their valuation snapshot');

-- The founder and the moderator are denied the member's book, but see membership and standing --
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0001-4001-8001-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.club_roster('c2c2c2c2-0000-4000-8000-000000000001') where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 1, 'founder sees the member on the roster');
select is((select count(*)::int from public.club_memberships where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 1, 'founder sees the membership row');
select is(
  (select rank from public.latest_standings('pgtap-cross') where board = 'club' and entrant_id = 'c2c2c2c2-0000-4000-8000-000000000001'),
  1,
  'founder sees the club public standing'
);
select is((select count(*)::int from public.registrations where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member registration or cash');
select is((select count(*)::int from public.orders where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member orders');
select is((select count(*)::int from public.order_reservations where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member reservations');
select is((select count(*)::int from public.executions where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member executions');
select is((select count(*)::int from public.cash_ledger where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member cash activity');
select is((select count(*)::int from public.positions where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member positions');
select is((select count(*)::int from public.valuation_snapshots where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member valuation snapshots');
select is((select count(*)::int from public.profiles where id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'founder reads no member profile row directly');
select is((select count(*)::int from public.public_holdings('a1a1a1a1-0003-4003-8003-000000000003')), 0, 'founder sees no member holdings while they are private');
select is((select holdings_public from public.public_profile('a1a1a1a1-0003-4003-8003-000000000003')), false, 'the public profile shows the holdings as private');
select is((select count(*)::int from public.orders), 0, 'founder sees only their own empty order list');
select is((select count(*)::int from public.positions), 0, 'founder sees only their own empty positions');
select throws_ok(
  format('select public.cancel_order(%L::uuid)', (select id from pgtap_cross_open)),
  'P0002', 'order_not_found', 'founder cannot cancel the member order'
);
select throws_ok(
  $$ select * from public.published_holdings_source('a1a1a1a1-0003-4003-8003-000000000003') $$,
  '42501', null, 'founder cannot call the private holdings source'
);
select is((select count(*)::int from public.club_applications('c2c2c2c2-0000-4000-8000-000000000001')), 0, 'leader projections carry applications only, no book');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0002-4002-8002-000000000002","role":"authenticated"}', true);

select is((select role from public.club_roster('c2c2c2c2-0000-4000-8000-000000000001') where student_id = 'a1a1a1a1-0002-4002-8002-000000000002'), 'moderator', 'fixture: the second leader is a moderator');
select is((select count(*)::int from public.club_roster('c2c2c2c2-0000-4000-8000-000000000001') where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 1, 'moderator sees the member on the roster');
select is((select count(*)::int from public.registrations where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'moderator reads no member registration or cash');
select is((select count(*)::int from public.orders where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'moderator reads no member orders');
select is((select count(*)::int from public.cash_ledger where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'moderator reads no member cash activity');
select is((select count(*)::int from public.positions where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'moderator reads no member positions');
select is((select count(*)::int from public.executions where student_id = 'a1a1a1a1-0003-4003-8003-000000000003'), 0, 'moderator reads no member executions');
select is((select count(*)::int from public.public_holdings('a1a1a1a1-0003-4003-8003-000000000003')), 0, 'moderator sees no member holdings while they are private');
select throws_ok(
  format('select public.cancel_order(%L::uuid)', (select id from pgtap_cross_open)),
  'P0002', 'order_not_found', 'moderator cannot cancel the member order'
);

-- Affiliation and club membership are independent public facts --------------------------------
select is(
  (select array[coalesce(verified_university, '-'), coalesce(club_id::text, '-')] from public.public_campus('a1a1a1a1-0004-4004-8004-000000000004')),
  array['University of Michigan', '-'],
  'verified without a club shows only the affiliation'
);
select is(
  (select array[coalesce(verified_university, '-'), coalesce(club_id::text, '-'), club_role] from public.public_campus('a1a1a1a1-0005-4005-8005-000000000005')),
  array['-', 'c2c2c2c2-0000-4000-8000-000000000001', 'member'],
  'a club member with a pending affiliation does not appear verified'
);
select is(
  (select array[coalesce(verified_university, '-'), coalesce(club_id::text, '-'), club_name] from public.public_campus('a1a1a1a1-0003-4003-8003-000000000003')),
  array['University of Michigan', 'c2c2c2c2-0000-4000-8000-000000000001', 'pgTAP Cross Club'],
  'verified and in a club shows both facts'
);
select is(
  (select count(*)::int from public.university_affiliations where student_id = 'a1a1a1a1-0005-4005-8005-000000000005'),
  0,
  'the pending affiliation row itself stays private'
);

-- A published standing carries no part of the private book ----------------------------------------
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
   where table_schema = 'public' and table_name = 'standing_entries'
     and column_name ~ '(quantity|cost|cash|position|holding|ticker|instrument|order)'),
  null,
  'public standing entries have no holdings, quantity, cost, cash, or order column'
);

-- Signed out --------------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.registrations $$, '42501', null, 'anon cannot read registrations or cash');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders');
select throws_ok($$ select * from public.order_reservations $$, '42501', null, 'anon cannot read reservations');
select throws_ok($$ select * from public.executions $$, '42501', null, 'anon cannot read executions');
select throws_ok($$ select * from public.cash_ledger $$, '42501', null, 'anon cannot read cash activity');
select throws_ok($$ select * from public.positions $$, '42501', null, 'anon cannot read positions');
select throws_ok($$ select * from public.valuation_snapshots $$, '42501', null, 'anon cannot read valuation snapshots');
select throws_ok($$ select * from public.public_holdings('a1a1a1a1-0003-4003-8003-000000000003') $$, '42501', null, 'anon cannot call public holdings');
select throws_ok($$ select * from public.public_profile('a1a1a1a1-0003-4003-8003-000000000003') $$, '42501', null, 'anon cannot call the public profile');
select throws_ok($$ select * from public.public_campus('a1a1a1a1-0003-4003-8003-000000000003') $$, '42501', null, 'anon cannot call public campus');
select throws_ok($$ select * from public.latest_standings('pgtap-cross') $$, '42501', null, 'anon cannot read standings');

select * from finish();
rollback;
