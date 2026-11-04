begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a1a1a1a1-1111-4111-8111-111111111111', 'watch-owner@example.test', '{"display_name":"Watch Owner"}', 'authenticated', 'authenticated'),
  ('b2b2b2b2-2222-4222-8222-222222222222', 'watch-other@example.test', '{"display_name":"Watch Other"}', 'authenticated', 'authenticated');

insert into public.instruments (id, name, kind, sector) values
  ('ZWATCHOPT', 'pgTAP test option', 'option', 'Test');

select is(
  (select relrowsecurity from pg_class where oid = 'public.watchlists'::regclass),
  true,
  'row level security is enabled on watchlists'
);

-- Owner -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is(public.watchlist_add('  aapl '), 'AAPL', 'owner adds a stock and the symbol is normalized');
select is(public.watchlist_add('SPY'), 'SPY', 'owner adds an ETF');
select is(public.watchlist_add('AAPL'), 'AAPL', 'adding the same symbol again is accepted');
select is((select count(*)::int from public.watchlists), 2, 'a repeated add does not duplicate the row');
select is(
  (select string_agg(instrument_id, ',' order by instrument_id) from public.watchlists),
  'AAPL,SPY',
  'owner reads their own watchlist'
);
select throws_ok($$ select public.watchlist_add('ZZZZNOPE') $$, 'P0002', 'unknown_instrument', 'an unlisted symbol is rejected');
select throws_ok($$ select public.watchlist_add('ZWATCHOPT') $$, 'P0001', 'instrument_not_allowed', 'only stocks and ETFs can be watched');
select throws_ok(
  $$ insert into public.watchlists (student_id, instrument_id) values ('a1a1a1a1-1111-4111-8111-111111111111', 'MSFT') $$,
  '42501', null, 'owner cannot insert a row directly'
);
select throws_ok(
  $$ insert into public.watchlists (student_id, instrument_id) values ('b2b2b2b2-2222-4222-8222-222222222222', 'MSFT') $$,
  '42501', null, 'owner cannot insert a row for another student'
);
select throws_ok($$ update public.watchlists set instrument_id = 'MSFT' $$, '42501', null, 'owner cannot update rows directly');
select throws_ok($$ delete from public.watchlists $$, '42501', null, 'owner cannot delete rows directly');
select throws_ok($$ select public.watchlist_limit() $$, '42501', null, 'the limit helper is not exposed to students');

-- Another student -------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2b2b2b2-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.watchlists), 0, 'another student cannot read the owner''s rows');
select is(public.watchlist_remove('AAPL'), false, 'another student removing AAPL removes nothing');
select is(public.watchlist_add('NVDA'), 'NVDA', 'another student keeps their own list');

reset role;
select is(
  (select string_agg(instrument_id, ',' order by instrument_id) from public.watchlists where student_id = 'a1a1a1a1-1111-4111-8111-111111111111'),
  'AAPL,SPY',
  'the owner''s list is unchanged by the other student'
);

-- Owner removes ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is(public.watchlist_remove(' spy'), true, 'owner removes a symbol');
select is(public.watchlist_remove('SPY'), false, 'removing an absent symbol is a no-op');
select is(
  (select string_agg(instrument_id, ',' order by instrument_id) from public.watchlists),
  'AAPL',
  'the removal is stored for the owner'
);

-- Signed out --------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select public.watchlist_add('AAPL') $$, '42501', null, 'a signed-out visitor cannot add');
select throws_ok($$ select count(*) from public.watchlists $$, '42501', null, 'a signed-out visitor cannot read watchlists');

reset role;
select * from finish();
rollback;
