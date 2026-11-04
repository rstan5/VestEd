-- Student watchlists. One row per owner and listed stock or ETF. Students read only their
-- own rows and change them only through watchlist_add and watchlist_remove, which take the
-- owner from auth.uid(). No request field can name another student.

create table public.watchlists (
  student_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id text not null references public.instruments (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (student_id, instrument_id)
);

alter table public.watchlists enable row level security;

revoke all on table public.watchlists from public, anon, authenticated;
grant select on table public.watchlists to authenticated;
grant all on table public.watchlists to service_role;

create policy watchlists_owner_read on public.watchlists
  for select to authenticated using (student_id = (select auth.uid()));

create function public.watchlist_limit() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;

create function public.watchlist_add(p_instrument text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_id text := upper(btrim(coalesce(p_instrument, '')));
  v_kind text;
begin
  if v_student is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_student) then
    raise exception using errcode = 'P0002', message = 'no_profile';
  end if;
  select i.kind into v_kind from public.instruments i where i.id = v_id;
  if v_kind is null then
    raise exception using errcode = 'P0002', message = 'unknown_instrument';
  end if;
  if v_kind not in ('stock', 'etf') then
    raise exception using errcode = 'P0001', message = 'instrument_not_allowed';
  end if;
  -- Serializes concurrent adds by the same student so the limit holds.
  perform 1 from public.profiles p where p.id = v_student for update;
  if not exists (select 1 from public.watchlists w where w.student_id = v_student and w.instrument_id = v_id)
     and (select count(*) from public.watchlists w where w.student_id = v_student) >= public.watchlist_limit() then
    raise exception using errcode = 'P0001', message = 'watchlist_full';
  end if;
  insert into public.watchlists (student_id, instrument_id) values (v_student, v_id)
  on conflict (student_id, instrument_id) do nothing;
  return v_id;
end;
$$;

create function public.watchlist_remove(p_instrument text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_id text := upper(btrim(coalesce(p_instrument, '')));
  v_removed integer;
begin
  if v_student is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  delete from public.watchlists w where w.student_id = v_student and w.instrument_id = v_id;
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

revoke execute on function public.watchlist_limit(), public.watchlist_add(text), public.watchlist_remove(text)
  from public, anon, authenticated;
grant execute on function public.watchlist_add(text), public.watchlist_remove(text) to authenticated;
grant execute on function public.watchlist_limit(), public.watchlist_add(text), public.watchlist_remove(text) to service_role;
