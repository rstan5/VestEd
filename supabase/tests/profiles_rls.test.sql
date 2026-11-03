begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', '{"display_name":"  Owner Student  "}', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'viewer@example.test', '{}', 'authenticated', 'authenticated');

select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Owner Student',
  'registration creates a profile with the trimmed display name'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'viewer',
  'missing display name falls back to the email local part'
);
select is(
  (select holdings_public from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  false,
  'holdings are private by default'
);
select is(
  (select onboarded_at from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  null,
  'a new profile has not finished onboarding'
);

-- Stand-in for the ledger's position source, so the gate can be tested with data present.
create or replace function public.published_holdings_source(owner uuid)
returns table (ticker text, weight numeric)
language sql stable security definer set search_path = ''
as $$
  select v.ticker, v.weight
  from (values ('AAPL'::text, 0.6::numeric), ('MSFT'::text, 0.4::numeric)) as v(ticker, weight)
  where owner = '11111111-1111-4111-8111-111111111111'::uuid;
$$;
revoke execute on function public.published_holdings_source(uuid) from public, anon, authenticated;

-- Anonymous visitors
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anon cannot read the profiles table'
);
select throws_ok(
  $$ select * from public.public_profile('11111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'anon cannot call the public profile projection'
);
select throws_ok(
  $$ select * from public.public_holdings('11111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'anon cannot call the public holdings projection'
);

-- Viewer, a second authenticated student
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  0,
  'another student cannot read the owner profile row'
);
select is(
  (select count(*)::int from public.profiles),
  1,
  'a student sees only their own profile row'
);

update public.profiles set display_name = 'Hijacked' where id = '11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$ select * from public.published_holdings_source('11111111-1111-4111-8111-111111111111') $$,
  '42501',
  null,
  'students cannot call the private holdings source directly'
);
select throws_ok(
  $$ insert into public.profiles (id, display_name) values ('33333333-3333-4333-8333-333333333333', 'Forged') $$,
  '42501',
  null,
  'students cannot insert profile rows'
);
select is(
  (select display_name from public.public_profile('11111111-1111-4111-8111-111111111111')),
  'Owner Student',
  'the public projection shows the display name, and the cross-student update changed nothing'
);
select is(
  (select holdings_public from public.public_profile('11111111-1111-4111-8111-111111111111')),
  false,
  'the public projection reports private holdings'
);
select is(
  (select count(*)::int from public.public_holdings('11111111-1111-4111-8111-111111111111')),
  0,
  'private holdings are not published'
);

-- Owner
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ update public.profiles set id = '33333333-3333-4333-8333-333333333333' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'the owner cannot change the profile id'
);
select throws_ok(
  $$ update public.profiles set created_at = now() - interval '1 year' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501',
  null,
  'the owner cannot rewrite created_at'
);

update public.profiles set display_name = 'Owner Renamed' where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Owner Renamed',
  'the owner can rename their profile'
);
select throws_ok(
  $$ update public.profiles set display_name = '   ' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514',
  null,
  'a blank display name is rejected'
);

update public.profiles set holdings_public = true where id = '11111111-1111-4111-8111-111111111111';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select holdings_public from public.public_profile('11111111-1111-4111-8111-111111111111')),
  true,
  'after opt-in the projection reports published holdings'
);
select is(
  (select array_agg(ticker order by ticker) from public.public_holdings('11111111-1111-4111-8111-111111111111')),
  array['AAPL', 'MSFT'],
  'after opt-in the viewer sees published tickers'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'viewer',
  'the owner rename did not change the viewer profile'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
update public.profiles set holdings_public = false where id = '11111111-1111-4111-8111-111111111111';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.public_holdings('11111111-1111-4111-8111-111111111111')),
  0,
  'after opt-out the holdings are hidden again'
);
select is(
  (select holdings_public from public.public_profile('11111111-1111-4111-8111-111111111111')),
  false,
  'after opt-out the projection reports private holdings'
);

reset role;
select isnt(
  (select holdings_public_changed_at from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  null,
  'privacy changes are timestamped'
);

select * from finish();
rollback;
