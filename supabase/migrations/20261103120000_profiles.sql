-- Student profiles. One row per auth user, created by trigger at registration.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 60),
  class_year smallint
    constraint profiles_class_year_range check (class_year between 1900 and 2100),
  concentration text
    constraint profiles_concentration_length check (char_length(concentration) <= 80),
  holdings_public boolean not null default false,
  holdings_public_changed_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.holdings_public is
  'Explicit, reversible consent to publish holdings. Private by default.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, class_year, concentration, holdings_public, onboarded_at)
  on table public.profiles to authenticated;

create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  if new.holdings_public is distinct from old.holdings_public then
    new.holdings_public_changed_at := now();
  end if;
  -- Onboarding completion is server-clocked and cannot be undone or backdated.
  if old.onboarded_at is not null then
    new.onboarded_at := old.onboarded_at;
  elsif new.onboarded_at is not null then
    new.onboarded_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if requested = '' then
    requested := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if requested = '' then
    requested := 'Student';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, btrim(left(requested, 60)));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Safe public projection. Never returns cash, quantities, cost, orders, or activity.
create function public.public_profile(target uuid)
returns table (
  id uuid,
  display_name text,
  class_year smallint,
  concentration text,
  member_since date,
  holdings_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.class_year, p.concentration, p.created_at::date, p.holdings_public
  from public.profiles p
  where p.id = target
    and (select auth.uid()) is not null;
$$;

revoke execute on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;

-- Private source of position weights for publication. The server ledger replaces this
-- body with a read over its positions; until then no student has holdings to publish.
create function public.published_holdings_source(owner uuid)
returns table (ticker text, weight numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select null::text, null::numeric where false;
$$;

revoke execute on function public.published_holdings_source(uuid) from public, anon, authenticated;

create function public.public_holdings(target uuid)
returns table (ticker text, weight numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.ticker, s.weight
  from public.profiles p
  cross join lateral public.published_holdings_source(p.id) s
  where p.id = target
    and p.holdings_public
    and (select auth.uid()) is not null
  order by s.weight desc, s.ticker;
$$;

revoke execute on function public.public_holdings(uuid) from public, anon;
grant execute on function public.public_holdings(uuid) to authenticated;
