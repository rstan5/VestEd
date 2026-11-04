-- Standings: valuation snapshots of each season book, provisional standings versions, round
-- closures, and insert-only finalized results. Students read public standings and their own
-- snapshots. Every write is a service-role SECURITY DEFINER function; no client writes a rank.

-- Valuation snapshots ------------------------------------------------------------

create table public.valuation_snapshots (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  valued_at timestamptz not null,
  status text not null
    constraint valuation_snapshots_status check (status in ('valued', 'unavailable')),
  equity numeric(14, 2),
  cash numeric(14, 2) not null,
  -- Position values at the snapshot's stored quotes, for diversification at a window close.
  holdings jsonb not null default '[]'::jsonb,
  missing text[] not null default '{}',
  recorded_at timestamptz not null default now(),
  constraint valuation_snapshots_shape check ((status = 'valued') = (equity is not null)),
  constraint valuation_snapshots_once unique (registration_id, valued_at)
);

comment on column public.valuation_snapshots.equity is
  'Null when any holding had no stored quote. A missing valuation is unavailable, never zero.';

create index valuation_snapshots_season on public.valuation_snapshots (season_id, valued_at);

-- Provisional standings ---------------------------------------------------------

create table public.standings_versions (
  id uuid primary key default gen_random_uuid(),
  season_id text not null references public.seasons (id) on delete cascade,
  -- Null is the whole-season window.
  round_id text references public.rounds (id) on delete cascade,
  board text not null
    constraint standings_versions_board check (board in ('individual', 'club', 'university')),
  as_of timestamptz not null,
  computed_at timestamptz not null default now()
);

create index standings_versions_latest
  on public.standings_versions (season_id, board, round_id, as_of desc, computed_at desc);

create table public.standing_entries (
  version_id uuid not null references public.standings_versions (id) on delete cascade,
  entrant_id text not null,
  entrant_name text not null,
  university_id text,
  club_id uuid,
  rank integer
    constraint standing_entries_rank check (rank >= 1),
  return_pct numeric,
  score numeric,
  score_label text,
  risk_adjusted numeric,
  drawdown numeric
    constraint standing_entries_drawdown check (drawdown >= 0),
  diversification numeric,
  consistency numeric,
  eligible_students integer,
  institutional boolean,
  withheld text[] not null default '{}',
  included text[] not null default '{}',
  primary key (version_id, entrant_id)
);

-- Finalized results ----------------------------------------------------------------

create table public.round_closures (
  round_id text primary key references public.rounds (id) on delete restrict,
  closed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table public.finalized_results (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.round_closures (round_id) on delete restrict,
  season_id text not null references public.seasons (id) on delete restrict,
  board text not null
    constraint finalized_results_board check (board in ('individual', 'club', 'university')),
  entrant_id text not null,
  entrant_name text not null,
  university_id text,
  club_id uuid,
  edition integer not null default 1
    constraint finalized_results_edition_positive check (edition >= 1),
  supersedes uuid references public.finalized_results (id) on delete restrict,
  rank integer
    constraint finalized_results_rank check (rank >= 1),
  return_pct numeric,
  score numeric,
  score_label text,
  risk_adjusted numeric,
  drawdown numeric
    constraint finalized_results_drawdown check (drawdown >= 0),
  diversification numeric,
  consistency numeric,
  eligible_students integer,
  institutional boolean,
  withheld text[] not null default '{}',
  included text[] not null default '{}',
  finalized_at timestamptz not null,
  correction_reason text,
  recorded_at timestamptz not null default now(),
  constraint finalized_results_one_edition unique (round_id, board, entrant_id, edition),
  constraint finalized_results_correction check (
    (edition = 1) = (supersedes is null) and (edition = 1) = (correction_reason is null)
  )
);

comment on table public.finalized_results is
  'Insert-only. A correction is a new edition that supersedes the earlier row, which stays as stored.';

create index finalized_results_entrant on public.finalized_results (board, entrant_id);

-- Finalized rows and closures cannot be changed or removed by any role, including the owner.
create function public.standings_insert_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'finalized_rows_are_insert_only';
end;
$$;

create trigger finalized_results_no_update before update or delete on public.finalized_results
  for each row execute function public.standings_insert_only();
create trigger finalized_results_no_truncate before truncate on public.finalized_results
  for each statement execute function public.standings_insert_only();
create trigger round_closures_no_update before update or delete on public.round_closures
  for each row execute function public.standings_insert_only();
create trigger round_closures_no_truncate before truncate on public.round_closures
  for each statement execute function public.standings_insert_only();

-- Row Level Security -------------------------------------------------------------------

alter table public.valuation_snapshots enable row level security;
alter table public.standings_versions enable row level security;
alter table public.standing_entries enable row level security;
alter table public.round_closures enable row level security;
alter table public.finalized_results enable row level security;

revoke all on table
  public.valuation_snapshots, public.standings_versions, public.standing_entries,
  public.round_closures, public.finalized_results
  from anon, authenticated;
grant select on table
  public.valuation_snapshots, public.standings_versions, public.standing_entries,
  public.round_closures, public.finalized_results
  to authenticated;
revoke update, delete, truncate on table public.round_closures, public.finalized_results from service_role;

create policy valuation_snapshots_owner_read on public.valuation_snapshots
  for select to authenticated using (student_id = (select auth.uid()));
create policy standings_versions_read on public.standings_versions
  for select to authenticated using (true);
create policy standing_entries_read on public.standing_entries
  for select to authenticated using (true);
create policy round_closures_read on public.round_closures
  for select to authenticated using (true);
create policy finalized_results_read on public.finalized_results
  for select to authenticated using (true);

-- Writers (service role only) -------------------------------------------------------------

-- Records one valuation the job computed, with the position values at the same stored quotes.
create function public.standings_record_valuation(
  p_registration uuid,
  p_valued_at timestamptz,
  p_status text,
  p_equity numeric,
  p_missing text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations;
  v_id bigint;
begin
  select * into v_registration from public.registrations r where r.id = p_registration;
  if v_registration.id is null then
    raise exception using errcode = 'P0002', message = 'unknown_registration';
  end if;
  insert into public.valuation_snapshots (registration_id, student_id, season_id, valued_at, status, equity, cash, holdings, missing)
  values (
    v_registration.id,
    v_registration.student_id,
    v_registration.season_id,
    p_valued_at,
    p_status,
    case when p_status = 'valued' then p_equity end,
    v_registration.cash,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'instrument_id', p.instrument_id,
        'sector', i.sector,
        'value', (p.quantity * q.price)::text
      ) order by p.instrument_id)
      from public.positions p
      join public.instruments i on i.id = p.instrument_id
      join lateral (
        select x.price from public.quotes x
        where x.instrument_id = p.instrument_id and x.as_of <= p_valued_at
        order by x.as_of desc, x.recorded_at desc
        limit 1
      ) q on true
      where p.registration_id = v_registration.id
    ), '[]'::jsonb),
    coalesce(p_missing, '{}')
  )
  on conflict (registration_id, valued_at) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- One provisional version of one board and window. Repeating the same as_of returns the stored version.
create function public.standings_publish(
  p_season text,
  p_round text,
  p_board text,
  p_as_of timestamptz,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
begin
  if p_round is not null and not exists (
    select 1 from public.rounds r where r.id = p_round and r.season_id = p_season
  ) then
    raise exception using errcode = 'P0002', message = 'unknown_round';
  end if;
  if p_round is not null and exists (select 1 from public.round_closures c where c.round_id = p_round) then
    raise exception using errcode = 'P0001', message = 'round_already_final';
  end if;

  select v.id into v_version from public.standings_versions v
  where v.season_id = p_season and v.round_id is not distinct from p_round and v.board = p_board and v.as_of = p_as_of
  limit 1;
  if v_version is not null then
    return v_version;
  end if;

  insert into public.standings_versions (season_id, round_id, board, as_of)
  values (p_season, p_round, p_board, p_as_of)
  returning id into v_version;

  insert into public.standing_entries (
    version_id, entrant_id, entrant_name, university_id, club_id, rank, return_pct, score, score_label,
    risk_adjusted, drawdown, diversification, consistency, eligible_students, institutional, withheld, included
  )
  select v_version, x.entrant_id, x.entrant_name, x.university_id, x.club_id, x.rank, x.return_pct, x.score, x.score_label,
    x.risk_adjusted, x.drawdown, x.diversification, x.consistency, x.eligible_students, x.institutional,
    coalesce(x.withheld, '{}'), coalesce(x.included, '{}')
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as x(
    entrant_id text, entrant_name text, university_id text, club_id uuid, rank integer, return_pct numeric, score numeric,
    score_label text, risk_adjusted numeric, drawdown numeric, diversification numeric, consistency numeric,
    eligible_students integer, institutional boolean, withheld text[], included text[]
  );
  return v_version;
end;
$$;

-- Closes a round once. All three boards are written in the same transaction as the closure.
create function public.standings_finalize_round(p_round text, p_closed_at timestamptz, p_results jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.rounds;
begin
  select * into v_round from public.rounds r where r.id = p_round for update;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'unknown_round';
  end if;
  if exists (select 1 from public.round_closures c where c.round_id = p_round) then
    return 'already-final';
  end if;
  if p_closed_at is null or p_closed_at < v_round.ends_at then
    raise exception using errcode = 'P0001', message = 'round_not_over';
  end if;

  insert into public.round_closures (round_id, closed_at) values (p_round, p_closed_at);
  insert into public.finalized_results (
    round_id, season_id, board, entrant_id, entrant_name, university_id, club_id, rank, return_pct, score, score_label,
    risk_adjusted, drawdown, diversification, consistency, eligible_students, institutional, withheld, included, finalized_at
  )
  select p_round, v_round.season_id, x.board, x.entrant_id, x.entrant_name, x.university_id, x.club_id, x.rank, x.return_pct,
    x.score, x.score_label, x.risk_adjusted, x.drawdown, x.diversification, x.consistency, x.eligible_students, x.institutional,
    coalesce(x.withheld, '{}'), coalesce(x.included, '{}'), p_closed_at
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as x(
    board text, entrant_id text, entrant_name text, university_id text, club_id uuid, rank integer, return_pct numeric,
    score numeric, score_label text, risk_adjusted numeric, drawdown numeric, diversification numeric, consistency numeric,
    eligible_students integer, institutional boolean, withheld text[], included text[]
  );
  return 'finalized';
end;
$$;

-- A correction inserts the next edition of the current row. Fields absent from p_changes are copied.
create function public.standings_correct_result(p_result uuid, p_changes jsonb, p_reason text, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.finalized_results;
  v_id uuid;
  v_changes jsonb := coalesce(p_changes, '{}'::jsonb);
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception using errcode = '22023', message = 'correction_reason_required';
  end if;
  select * into v_row from public.finalized_results f where f.id = p_result;
  if v_row.id is null then
    raise exception using errcode = 'P0002', message = 'unknown_result';
  end if;
  perform 1 from public.round_closures c where c.round_id = v_row.round_id for update;
  if exists (
    select 1 from public.finalized_results f
    where f.round_id = v_row.round_id and f.board = v_row.board and f.entrant_id = v_row.entrant_id and f.edition > v_row.edition
  ) then
    raise exception using errcode = 'P0001', message = 'result_already_superseded';
  end if;

  insert into public.finalized_results (
    round_id, season_id, board, entrant_id, entrant_name, university_id, club_id, edition, supersedes, rank, return_pct,
    score, score_label, risk_adjusted, drawdown, diversification, consistency, eligible_students, institutional, withheld,
    included, finalized_at, correction_reason
  )
  values (
    v_row.round_id, v_row.season_id, v_row.board, v_row.entrant_id, v_row.entrant_name, v_row.university_id, v_row.club_id,
    v_row.edition + 1, v_row.id,
    case when v_changes ? 'rank' then (v_changes ->> 'rank')::integer else v_row.rank end,
    case when v_changes ? 'return_pct' then (v_changes ->> 'return_pct')::numeric else v_row.return_pct end,
    case when v_changes ? 'score' then (v_changes ->> 'score')::numeric else v_row.score end,
    case when v_changes ? 'score_label' then v_changes ->> 'score_label' else v_row.score_label end,
    case when v_changes ? 'risk_adjusted' then (v_changes ->> 'risk_adjusted')::numeric else v_row.risk_adjusted end,
    case when v_changes ? 'drawdown' then (v_changes ->> 'drawdown')::numeric else v_row.drawdown end,
    case when v_changes ? 'diversification' then (v_changes ->> 'diversification')::numeric else v_row.diversification end,
    case when v_changes ? 'consistency' then (v_changes ->> 'consistency')::numeric else v_row.consistency end,
    v_row.eligible_students, v_row.institutional, v_row.withheld, v_row.included, coalesce(p_at, now()), btrim(p_reason)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Readers (row level security applies) ------------------------------------------------------

-- The latest version of every board and window in a season, with its entries.
create function public.latest_standings(p_season text)
returns table (
  round_id text,
  board text,
  as_of timestamptz,
  entrant_id text,
  entrant_name text,
  university_id text,
  club_id uuid,
  rank integer,
  return_pct text,
  score text,
  score_label text,
  risk_adjusted text,
  drawdown text,
  diversification text,
  consistency text,
  eligible_students integer,
  institutional boolean,
  withheld text[],
  included text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (v.round_id, v.board) v.id, v.round_id, v.board, v.as_of
    from public.standings_versions v
    where v.season_id = p_season
    order by v.round_id, v.board, v.as_of desc, v.computed_at desc
  )
  select l.round_id, l.board, l.as_of, e.entrant_id, e.entrant_name, e.university_id, e.club_id, e.rank,
    e.return_pct::text, e.score::text, e.score_label, e.risk_adjusted::text, e.drawdown::text, e.diversification::text,
    e.consistency::text, e.eligible_students, e.institutional, e.withheld, e.included
  from latest l
  join public.standing_entries e on e.version_id = l.id;
$$;

-- The current edition of each finalized row, optionally for one season.
create function public.current_finalized_results(p_season text default null)
returns table (
  id uuid,
  round_id text,
  season_id text,
  board text,
  entrant_id text,
  entrant_name text,
  university_id text,
  club_id uuid,
  edition integer,
  rank integer,
  return_pct text,
  score text,
  score_label text,
  risk_adjusted text,
  drawdown text,
  diversification text,
  consistency text,
  eligible_students integer,
  institutional boolean,
  withheld text[],
  included text[],
  finalized_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (f.round_id, f.board, f.entrant_id)
    f.id, f.round_id, f.season_id, f.board, f.entrant_id, f.entrant_name, f.university_id, f.club_id, f.edition, f.rank,
    f.return_pct::text, f.score::text, f.score_label, f.risk_adjusted::text, f.drawdown::text, f.diversification::text,
    f.consistency::text, f.eligible_students, f.institutional, f.withheld, f.included, f.finalized_at
  from public.finalized_results f
  where p_season is null or f.season_id = p_season
  order by f.round_id, f.board, f.entrant_id, f.edition desc;
$$;

-- Function privileges -------------------------------------------------------------------------

revoke execute on function
  public.standings_insert_only(),
  public.standings_record_valuation(uuid, timestamptz, text, numeric, text[]),
  public.standings_publish(text, text, text, timestamptz, jsonb),
  public.standings_finalize_round(text, timestamptz, jsonb),
  public.standings_correct_result(uuid, jsonb, text, timestamptz),
  public.latest_standings(text),
  public.current_finalized_results(text)
  from public, anon, authenticated;

grant execute on function
  public.standings_record_valuation(uuid, timestamptz, text, numeric, text[]),
  public.standings_publish(text, text, text, timestamptz, jsonb),
  public.standings_finalize_round(text, timestamptz, jsonb),
  public.standings_correct_result(uuid, jsonb, text, timestamptz)
  to service_role;

grant execute on function
  public.latest_standings(text),
  public.current_finalized_results(text)
  to authenticated, service_role;
