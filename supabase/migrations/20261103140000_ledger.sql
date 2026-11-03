-- Server ledger: seasons and rounds, instruments, stored quotes, the exchange calendar,
-- season registrations, orders, reservations, executions, the cash ledger, and positions.
-- Students hold SELECT on their own rows only. Every change is a SECURITY DEFINER function.
-- Functions that take an explicit student or clock are service-role only; the student-facing
-- wrappers read auth.uid() and now() so a client cannot pick the account, the time, or the price.

create extension if not exists btree_gist with schema extensions;

-- Seasons and rounds -----------------------------------------------------------

create table public.seasons (
  id text primary key
    constraint seasons_id_format check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starting_capital numeric(14, 2) not null default 100000.00
    constraint seasons_starting_capital check (starting_capital = 100000.00),
  constraint seasons_window check (ends_at > starts_at)
);

comment on column public.seasons.starting_capital is
  'Virtual capital credited once per season registration. Rounds never refill it.';

create table public.rounds (
  id text primary key,
  season_id text not null references public.seasons (id) on delete cascade,
  number smallint not null
    constraint rounds_number_positive check (number >= 1),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint rounds_season_number unique (season_id, number),
  -- Three calendar weeks in New York time, so a DST change does not move the boundary.
  constraint rounds_three_weeks
    check (ends_at = ((starts_at at time zone 'America/New_York') + interval '21 days') at time zone 'America/New_York'),
  constraint rounds_no_overlap
    exclude using gist (season_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create function public.rounds_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_season public.seasons;
begin
  select * into v_season from public.seasons s where s.id = new.season_id;
  if new.number = 1 and new.starts_at <> v_season.starts_at then
    raise exception using errcode = '23514', message = 'first_round_must_start_with_season';
  end if;
  if new.number > 1 and not exists (
    select 1 from public.rounds r
    where r.season_id = new.season_id and r.number = new.number - 1 and r.ends_at = new.starts_at
  ) then
    raise exception using errcode = '23514', message = 'rounds_must_be_consecutive';
  end if;
  if new.ends_at > v_season.ends_at then
    raise exception using errcode = '23514', message = 'round_outside_season';
  end if;
  return new;
end;
$$;

create trigger rounds_before_insert
  before insert on public.rounds
  for each row execute function public.rounds_before_insert();

create function public.ledger_create_season(p_id text, p_name text, p_starts_at timestamptz, p_rounds integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_starts_at at time zone 'America/New_York';
  i integer;
begin
  if p_rounds is null or p_rounds < 1 or p_rounds > 12 then
    raise exception using errcode = '22023', message = 'invalid_round_count';
  end if;
  insert into public.seasons (id, name, starts_at, ends_at)
  values (p_id, p_name, p_starts_at, (v_local + make_interval(days => 21 * p_rounds)) at time zone 'America/New_York');
  for i in 1..p_rounds loop
    insert into public.rounds (id, season_id, number, name, starts_at, ends_at)
    values (
      p_id || '-r' || i,
      p_id,
      i,
      'Round ' || i,
      (v_local + make_interval(days => 21 * (i - 1))) at time zone 'America/New_York',
      (v_local + make_interval(days => 21 * i)) at time zone 'America/New_York'
    );
  end loop;
  return p_id;
end;
$$;

-- Instruments, quotes, and the exchange calendar -------------------------------

create table public.instruments (
  id text primary key
    constraint instruments_id_format check (id ~ '^[A-Z0-9][A-Z0-9.-]{0,24}$'),
  name text not null,
  kind text not null
    constraint instruments_kind check (kind in ('stock', 'etf', 'leveraged_etf', 'option', 'future', 'crypto')),
  sector text,
  tradable boolean not null default true
);

comment on column public.instruments.kind is
  'Only stock and etf are orderable. Other kinds exist so a request for them is rejected by rule, not by accident.';

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  instrument_id text not null references public.instruments (id) on delete cascade,
  price numeric(14, 4) not null
    constraint quotes_price_positive check (price > 0),
  as_of timestamptz not null,
  source text not null
    constraint quotes_source check (source in ('sample', 'licensed')),
  recorded_at timestamptz not null default now()
);

comment on column public.quotes.source is
  'sample marks fixture prices. There is no live source until a licensed vendor adapter exists.';

create index quotes_instrument_as_of on public.quotes (instrument_id, as_of);

-- Exceptions to regular 09:30-16:00 New York weekday sessions.
create table public.market_calendar (
  session_date date primary key,
  closed boolean not null,
  close_time time,
  note text not null,
  constraint market_calendar_shape check (closed = (close_time is null))
);

insert into public.market_calendar (session_date, closed, close_time, note) values
  ('2026-01-01', true, null, 'New Year''s Day'),
  ('2026-01-19', true, null, 'Martin Luther King Jr. Day'),
  ('2026-02-16', true, null, 'Washington''s Birthday'),
  ('2026-04-03', true, null, 'Good Friday'),
  ('2026-05-25', true, null, 'Memorial Day'),
  ('2026-06-19', true, null, 'Juneteenth'),
  ('2026-07-03', true, null, 'Independence Day (observed)'),
  ('2026-09-07', true, null, 'Labor Day'),
  ('2026-11-26', true, null, 'Thanksgiving Day'),
  ('2026-11-27', false, '13:00', 'Day after Thanksgiving, early close'),
  ('2026-12-24', false, '13:00', 'Christmas Eve, early close'),
  ('2026-12-25', true, null, 'Christmas Day'),
  ('2027-01-01', true, null, 'New Year''s Day'),
  ('2027-01-18', true, null, 'Martin Luther King Jr. Day'),
  ('2027-02-15', true, null, 'Washington''s Birthday'),
  ('2027-03-26', true, null, 'Good Friday'),
  ('2027-05-31', true, null, 'Memorial Day'),
  ('2027-06-18', true, null, 'Juneteenth (observed)'),
  ('2027-07-05', true, null, 'Independence Day (observed)'),
  ('2027-09-06', true, null, 'Labor Day'),
  ('2027-11-25', true, null, 'Thanksgiving Day'),
  ('2027-11-26', false, '13:00', 'Day after Thanksgiving, early close'),
  ('2027-12-24', true, null, 'Christmas Day (observed)');

-- The first regular session whose close is after p_at. Mirrors newYorkSessionClock in src/lib/jobs/clock.ts.
create function public.ledger_session_for(p_at timestamptz)
returns table (open_at timestamptz, close_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date := (p_at at time zone 'America/New_York')::date;
  v_closed boolean;
  v_close time;
  i integer;
begin
  for i in 0..20 loop
    if extract(isodow from v_day) < 6 then
      select c.closed, c.close_time into v_closed, v_close
      from public.market_calendar c where c.session_date = v_day;
      if not found then
        v_closed := false;
        v_close := null;
      end if;
      if not v_closed then
        open_at := (v_day + time '09:30') at time zone 'America/New_York';
        close_at := (v_day + coalesce(v_close, time '16:00')) at time zone 'America/New_York';
        if close_at > p_at then
          return next;
          return;
        end if;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  raise exception using errcode = 'P0001', message = 'no_session_in_calendar';
end;
$$;

-- Eligibility is the later of acceptance plus 15 minutes and the next regular open.
-- A DAY order expires at the close of the session it is eligible to work.
create function public.ledger_order_window(p_accepted_at timestamptz)
returns table (eligible_at timestamptz, expires_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select greatest(p_accepted_at + interval '15 minutes', s.open_at), s.close_at
  from public.ledger_session_for(p_accepted_at + interval '15 minutes') s;
$$;

create function public.latest_quotes(p_at timestamptz default now())
returns table (instrument_id text, quote_id uuid, price text, as_of timestamptz, source text)
language sql
stable
set search_path = ''
as $$
  select distinct on (q.instrument_id) q.instrument_id, q.id, q.price::text, q.as_of, q.source
  from public.quotes q
  where q.as_of <= p_at
  order by q.instrument_id, q.as_of desc, q.recorded_at desc;
$$;

-- Books ------------------------------------------------------------------------

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  season_id text not null references public.seasons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  starting_capital numeric(14, 2) not null
    constraint registrations_starting_capital check (starting_capital = 100000.00),
  cash numeric(14, 2) not null
    constraint registrations_cash_nonnegative check (cash >= 0),
  registered_at timestamptz not null,
  constraint registrations_one_per_season unique (season_id, student_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id text not null references public.instruments (id),
  side text not null
    constraint orders_side check (side in ('buy', 'sell')),
  quantity integer not null
    constraint orders_quantity_positive check (quantity > 0),
  time_in_force text not null default 'day'
    constraint orders_time_in_force check (time_in_force = 'day'),
  idempotency_key text not null,
  status text not null default 'accepted'
    constraint orders_status check (status in ('accepted', 'filled', 'rejected', 'cancelled', 'expired')),
  accepted_at timestamptz not null,
  eligible_at timestamptz not null,
  expires_at timestamptz not null,
  reference_quote_id uuid references public.quotes (id) on delete set null,
  reference_price numeric(14, 4),
  closed_at timestamptz,
  reason text,
  constraint orders_one_per_key unique (student_id, idempotency_key),
  constraint orders_wait check (eligible_at >= accepted_at + interval '15 minutes'),
  constraint orders_expiry check (expires_at > eligible_at),
  constraint orders_closed check ((status = 'accepted') = (closed_at is null))
);

create index orders_accepted on public.orders (eligible_at) where status = 'accepted';
create index orders_registration on public.orders (registration_id, accepted_at desc);

create table public.order_reservations (
  order_id uuid primary key references public.orders (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    constraint order_reservations_kind check (kind in ('cash', 'shares')),
  instrument_id text not null references public.instruments (id),
  amount numeric(14, 2) not null
    constraint order_reservations_amount_positive check (amount > 0),
  held_at timestamptz not null,
  released_at timestamptz,
  release_reason text
    constraint order_reservations_release_reason check (release_reason in ('filled', 'rejected', 'cancelled', 'expired')),
  constraint order_reservations_release check ((released_at is null) = (release_reason is null))
);

create index order_reservations_held on public.order_reservations (registration_id) where released_at is null;

create table public.executions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id text not null references public.instruments (id),
  side text not null,
  quantity integer not null,
  quote_id uuid not null references public.quotes (id),
  price numeric(14, 4) not null,
  gross numeric(14, 2) not null,
  simulation_cost numeric(14, 2) not null,
  net_cash numeric(14, 2) not null,
  realized numeric,
  executed_at timestamptz not null,
  recorded_at timestamptz not null
);

create table public.cash_ledger (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    constraint cash_ledger_kind check (kind in ('opening', 'trade', 'simulation_cost')),
  amount numeric(14, 2) not null,
  order_id uuid references public.orders (id) on delete cascade,
  execution_id uuid references public.executions (id) on delete cascade,
  memo text not null,
  created_at timestamptz not null
);

-- One opening credit per registration. A round boundary has nothing to refill.
create unique index cash_ledger_one_opening on public.cash_ledger (registration_id) where kind = 'opening';

-- Quantity is numeric so a later corporate action can create a fraction; user orders stay whole.
-- Cost basis is unrounded aggregate cost. Average cost is derived.
create table public.positions (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  instrument_id text not null references public.instruments (id),
  quantity numeric not null
    constraint positions_quantity_positive check (quantity > 0),
  cost_basis numeric not null
    constraint positions_cost_basis_nonnegative check (cost_basis >= 0),
  updated_at timestamptz not null,
  primary key (registration_id, instrument_id)
);

-- Row Level Security -------------------------------------------------------------

alter table public.seasons enable row level security;
alter table public.rounds enable row level security;
alter table public.instruments enable row level security;
alter table public.quotes enable row level security;
alter table public.market_calendar enable row level security;
alter table public.registrations enable row level security;
alter table public.orders enable row level security;
alter table public.order_reservations enable row level security;
alter table public.executions enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.positions enable row level security;

revoke all on table
  public.seasons, public.rounds, public.instruments, public.quotes, public.market_calendar,
  public.registrations, public.orders, public.order_reservations, public.executions,
  public.cash_ledger, public.positions
  from anon, authenticated;
grant select on table
  public.seasons, public.rounds, public.instruments, public.quotes, public.market_calendar,
  public.registrations, public.orders, public.order_reservations, public.executions,
  public.cash_ledger, public.positions
  to authenticated;

create policy seasons_read on public.seasons for select to authenticated using (true);
create policy rounds_read on public.rounds for select to authenticated using (true);
create policy instruments_read on public.instruments for select to authenticated using (true);
create policy quotes_read on public.quotes for select to authenticated using (true);
create policy market_calendar_read on public.market_calendar for select to authenticated using (true);

create policy registrations_owner_read on public.registrations
  for select to authenticated using (student_id = (select auth.uid()));
create policy orders_owner_read on public.orders
  for select to authenticated using (student_id = (select auth.uid()));
create policy order_reservations_owner_read on public.order_reservations
  for select to authenticated using (student_id = (select auth.uid()));
create policy executions_owner_read on public.executions
  for select to authenticated using (student_id = (select auth.uid()));
create policy cash_ledger_owner_read on public.cash_ledger
  for select to authenticated using (student_id = (select auth.uid()));
create policy positions_owner_read on public.positions
  for select to authenticated using (student_id = (select auth.uid()));

-- Ledger constants -----------------------------------------------------------------

create function public.ledger_simulation_cost_per_share()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.01::numeric $$;

-- Buys reserve the reference quote plus this collar and the simulation cost. A fill whose
-- actual debit exceeds the reserve is rejected rather than overdrawn or shrunk.
create function public.ledger_reserve_collar()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.05::numeric $$;

create function public.ledger_buy_reserve(p_quantity integer, p_price numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select ceil((p_quantity * p_price * (1 + public.ledger_reserve_collar())
    + p_quantity * public.ledger_simulation_cost_per_share()) * 100) / 100;
$$;

-- Payloads ---------------------------------------------------------------------------

create function public.ledger_order_payload(p_order uuid, p_replayed boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'student_id', o.student_id,
    'registration_id', o.registration_id,
    'season_id', r.season_id,
    'instrument_id', o.instrument_id,
    'side', o.side,
    'quantity', o.quantity,
    'time_in_force', o.time_in_force,
    'idempotency_key', o.idempotency_key,
    'status', o.status,
    'accepted_at', o.accepted_at,
    'eligible_at', o.eligible_at,
    'expires_at', o.expires_at,
    'reference_quote_id', o.reference_quote_id,
    'reference_price', o.reference_price::text,
    'reservation', case when v.order_id is null then null else jsonb_build_object(
      'kind', v.kind,
      'amount', v.amount::text,
      'held', v.released_at is null,
      'released_at', v.released_at,
      'release_reason', v.release_reason
    ) end,
    'execution', case when e.id is null then null else jsonb_build_object(
      'id', e.id,
      'quote_id', e.quote_id,
      'price', e.price::text,
      'gross', e.gross::text,
      'simulation_cost', e.simulation_cost::text,
      'net_cash', e.net_cash::text,
      'executed_at', e.executed_at
    ) end,
    'closed_at', o.closed_at,
    'reason', o.reason,
    'replayed', p_replayed
  )
  from public.orders o
  join public.registrations r on r.id = o.registration_id
  left join public.order_reservations v on v.order_id = o.id
  left join public.executions e on e.order_id = o.id
  where o.id = p_order;
$$;

create function public.ledger_registration_payload(p_registration uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'season_id', r.season_id,
    'student_id', r.student_id,
    'starting_capital', r.starting_capital::text,
    'cash', r.cash::text,
    'registered_at', r.registered_at
  )
  from public.registrations r
  where r.id = p_registration;
$$;

-- Registration ---------------------------------------------------------------------

create function public.ledger_register(p_student uuid, p_season text, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_registration uuid;
begin
  if p_student is null or not exists (select 1 from public.profiles p where p.id = p_student) then
    raise exception using errcode = 'P0002', message = 'no_profile';
  end if;
  if p_season is null then
    select * into v_season from public.seasons s
    where s.ends_at > p_at
    order by (s.starts_at <= p_at) desc, s.starts_at
    limit 1;
  else
    select * into v_season from public.seasons s where s.id = p_season;
  end if;
  if v_season.id is null then
    raise exception using errcode = 'P0002', message = 'no_open_season';
  end if;
  if p_at >= v_season.ends_at then
    raise exception using errcode = 'P0001', message = 'season_closed';
  end if;

  insert into public.registrations (season_id, student_id, starting_capital, cash, registered_at)
  values (v_season.id, p_student, v_season.starting_capital, v_season.starting_capital, p_at)
  on conflict (season_id, student_id) do nothing
  returning id into v_registration;

  if v_registration is null then
    select r.id into v_registration from public.registrations r
    where r.season_id = v_season.id and r.student_id = p_student;
    return v_registration;
  end if;

  insert into public.cash_ledger (registration_id, student_id, kind, amount, memo, created_at)
  values (v_registration, p_student, 'opening', v_season.starting_capital, 'Season starting capital', p_at);
  return v_registration;
end;
$$;

create function public.register_for_season(p_season text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  return public.ledger_registration_payload(public.ledger_register(v_uid, p_season, now()));
end;
$$;

-- Accept -----------------------------------------------------------------------------

create function public.ledger_accept_order(
  p_student uuid,
  p_instrument text,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_instrument_id text := upper(btrim(coalesce(p_instrument, '')));
  v_side text := lower(btrim(coalesce(p_side, '')));
  v_registration public.registrations;
  v_season public.seasons;
  v_existing public.orders;
  v_instrument public.instruments;
  v_quote public.quotes;
  v_quantity integer;
  v_eligible timestamptz;
  v_expires timestamptz;
  v_reserve numeric;
  v_available numeric;
  v_order uuid;
  v_registration_id uuid;
begin
  if p_at is null then
    raise exception using errcode = '22023', message = 'missing_clock';
  end if;
  if v_key !~ '^[A-Za-z0-9_.:-]{8,100}$' then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  -- Locking the book serializes every order, cancel, and fill for this student.
  -- Registration runs as its own statement so the lock below sees a row it just inserted.
  v_registration_id := public.ledger_register(p_student, null, p_at);
  select * into v_registration from public.registrations r
  where r.id = v_registration_id
  for update;
  select * into v_season from public.seasons s where s.id = v_registration.season_id;

  select * into v_existing from public.orders o
  where o.student_id = p_student and o.idempotency_key = v_key;
  if found then
    if v_existing.instrument_id = v_instrument_id
      and v_existing.side = v_side
      and p_quantity is not null
      and v_existing.quantity::numeric = p_quantity then
      return public.ledger_order_payload(v_existing.id, true);
    end if;
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;

  if v_side not in ('buy', 'sell') then
    raise exception using errcode = '22023', message = 'invalid_side';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'quantity_not_positive';
  end if;
  if p_quantity <> trunc(p_quantity) then
    raise exception using errcode = '22023', message = 'fractional_quantity';
  end if;
  if p_quantity > 1000000 then
    raise exception using errcode = '22023', message = 'quantity_too_large';
  end if;
  v_quantity := p_quantity::integer;

  select * into v_instrument from public.instruments i where i.id = v_instrument_id;
  if v_instrument.id is null then
    raise exception using errcode = 'P0002', message = 'unknown_instrument';
  end if;
  if v_instrument.kind not in ('stock', 'etf') or not v_instrument.tradable then
    raise exception using errcode = 'P0001', message = 'instrument_not_allowed';
  end if;

  select w.eligible_at, w.expires_at into v_eligible, v_expires from public.ledger_order_window(p_at) w;
  if p_at < v_season.starts_at then
    raise exception using errcode = 'P0001', message = 'season_not_started';
  end if;
  if v_eligible >= v_season.ends_at then
    raise exception using errcode = 'P0001', message = 'season_closed';
  end if;

  select * into v_quote from public.quotes q
  where q.instrument_id = v_instrument.id and q.as_of <= p_at
  order by q.as_of desc, q.recorded_at desc
  limit 1;

  if v_side = 'buy' then
    if v_quote.id is null then
      raise exception using errcode = 'P0001', message = 'no_reference_quote';
    end if;
    v_reserve := public.ledger_buy_reserve(v_quantity, v_quote.price);
    select v_registration.cash - coalesce(sum(x.amount), 0) into v_available
    from public.order_reservations x
    where x.registration_id = v_registration.id and x.kind = 'cash' and x.released_at is null;
    if v_reserve > v_available then
      raise exception using errcode = 'P0001', message = 'insufficient_cash';
    end if;
  else
    v_reserve := v_quantity;
    select coalesce(max(p.quantity), 0) - coalesce((
      select sum(x.amount) from public.order_reservations x
      where x.registration_id = v_registration.id and x.kind = 'shares'
        and x.instrument_id = v_instrument.id and x.released_at is null
    ), 0) into v_available
    from public.positions p
    where p.registration_id = v_registration.id and p.instrument_id = v_instrument.id;
    if v_reserve > v_available then
      raise exception using errcode = 'P0001', message = 'insufficient_shares';
    end if;
  end if;

  insert into public.orders (
    registration_id, student_id, instrument_id, side, quantity, idempotency_key,
    accepted_at, eligible_at, expires_at, reference_quote_id, reference_price
  )
  values (
    v_registration.id, p_student, v_instrument.id, v_side, v_quantity, v_key,
    p_at, v_eligible, v_expires, v_quote.id, v_quote.price
  )
  returning id into v_order;

  insert into public.order_reservations (order_id, registration_id, student_id, kind, instrument_id, amount, held_at)
  values (v_order, v_registration.id, p_student, case when v_side = 'buy' then 'cash' else 'shares' end, v_instrument.id, v_reserve, p_at);

  return public.ledger_order_payload(v_order, false);
end;
$$;

create function public.place_order(p_instrument text, p_side text, p_quantity numeric, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  return public.ledger_accept_order(v_uid, p_instrument, p_side, p_quantity, p_idempotency_key, now());
end;
$$;

-- Settle helpers ------------------------------------------------------------------------

create function public.ledger_release(p_order uuid, p_reason text, p_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.order_reservations x
    set released_at = p_at, release_reason = p_reason
    where x.order_id = p_order and x.released_at is null;
$$;

create function public.ledger_lock_order(p_order uuid)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_registration uuid;
  v_order public.orders;
begin
  select o.registration_id into v_registration from public.orders o where o.id = p_order;
  if v_registration is null then
    return null;
  end if;
  perform 1 from public.registrations r where r.id = v_registration for update;
  select * into v_order from public.orders o where o.id = p_order for update;
  return v_order;
end;
$$;

-- Cancel --------------------------------------------------------------------------------

create function public.ledger_cancel_order(p_student uuid, p_order uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.ledger_lock_order(p_order);
begin
  if v_order.id is null or v_order.student_id is distinct from p_student then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;
  if v_order.status <> 'accepted' then
    raise exception using errcode = 'P0001', message = 'order_not_open';
  end if;
  update public.orders o
    set status = 'cancelled', closed_at = greatest(p_at, o.accepted_at), reason = 'Cancelled before fill.'
    where o.id = v_order.id;
  perform public.ledger_release(v_order.id, 'cancelled', greatest(p_at, v_order.accepted_at));
  return public.ledger_order_payload(v_order.id, false);
end;
$$;

create function public.cancel_order(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  return public.ledger_cancel_order(v_uid, p_order, now());
end;
$$;

-- Fill and expire -------------------------------------------------------------------------

create function public.ledger_fill_order(p_order uuid, p_quote uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.ledger_lock_order(p_order);
  v_quote public.quotes;
  v_reservation public.order_reservations;
  v_position public.positions;
  v_gross numeric;
  v_cost numeric;
  v_net numeric;
  v_basis_out numeric;
  v_execution uuid;
  v_memo text;
begin
  if v_order.id is null or v_order.status <> 'accepted' then
    return jsonb_build_object('status', 'skipped', 'reason', 'order_not_open');
  end if;
  select * into v_quote from public.quotes q where q.id = p_quote;
  if v_quote.id is null or v_quote.instrument_id <> v_order.instrument_id then
    return jsonb_build_object('status', 'skipped', 'reason', 'quote_not_for_order');
  end if;
  if v_quote.as_of < v_order.eligible_at then
    return jsonb_build_object('status', 'skipped', 'reason', 'quote_before_eligibility');
  end if;
  if v_quote.as_of >= v_order.expires_at then
    return jsonb_build_object('status', 'skipped', 'reason', 'quote_after_expiry');
  end if;
  if p_at is null or p_at < v_quote.as_of then
    return jsonb_build_object('status', 'skipped', 'reason', 'quote_not_yet_available');
  end if;
  if exists (
    select 1 from public.quotes q
    where q.instrument_id = v_order.instrument_id
      and q.as_of >= v_order.eligible_at
      and (q.as_of < v_quote.as_of or (q.as_of = v_quote.as_of and q.recorded_at < v_quote.recorded_at))
  ) then
    return jsonb_build_object('status', 'skipped', 'reason', 'not_first_qualifying_quote');
  end if;

  select * into v_reservation from public.order_reservations x where x.order_id = v_order.id;
  v_gross := round(v_order.quantity * v_quote.price, 2);
  v_cost := v_order.quantity * public.ledger_simulation_cost_per_share();

  if v_order.side = 'buy' then
    v_net := -(v_gross + v_cost);
    if v_reservation.released_at is not null or -v_net > v_reservation.amount then
      update public.orders o
        set status = 'rejected', closed_at = v_quote.as_of,
            reason = format('Debit %s exceeds the reserved %s. Nothing was bought.', (-v_net)::text, v_reservation.amount::text)
        where o.id = v_order.id;
      perform public.ledger_release(v_order.id, 'rejected', v_quote.as_of);
      return jsonb_build_object('status', 'rejected', 'reason', 'debit_exceeds_reserve');
    end if;
  else
    select * into v_position from public.positions p
    where p.registration_id = v_order.registration_id and p.instrument_id = v_order.instrument_id
    for update;
    v_net := v_gross - v_cost;
    if v_position.quantity is null or v_position.quantity < v_order.quantity or v_net < 0 then
      update public.orders o
        set status = 'rejected', closed_at = v_quote.as_of, reason = 'The position no longer covers this sale. Nothing was sold.'
        where o.id = v_order.id;
      perform public.ledger_release(v_order.id, 'rejected', v_quote.as_of);
      return jsonb_build_object('status', 'rejected', 'reason', 'insufficient_shares');
    end if;
    v_basis_out := v_position.cost_basis * v_order.quantity / v_position.quantity;
  end if;

  insert into public.executions (
    order_id, registration_id, student_id, instrument_id, side, quantity, quote_id, price,
    gross, simulation_cost, net_cash, realized, executed_at, recorded_at
  )
  values (
    v_order.id, v_order.registration_id, v_order.student_id, v_order.instrument_id, v_order.side,
    v_order.quantity, v_quote.id, v_quote.price, v_gross, v_cost, v_net,
    case when v_order.side = 'sell' then v_net - v_basis_out end,
    v_quote.as_of, p_at
  )
  returning id into v_execution;

  update public.registrations r set cash = r.cash + v_net where r.id = v_order.registration_id;

  v_memo := format('%s %s %s at %s', initcap(case when v_order.side = 'buy' then 'bought' else 'sold' end),
    v_order.quantity, v_order.instrument_id, v_quote.price::text);
  insert into public.cash_ledger (registration_id, student_id, kind, amount, order_id, execution_id, memo, created_at)
  values
    (v_order.registration_id, v_order.student_id, 'trade',
      case when v_order.side = 'buy' then -v_gross else v_gross end, v_order.id, v_execution, v_memo, v_quote.as_of),
    (v_order.registration_id, v_order.student_id, 'simulation_cost', -v_cost, v_order.id, v_execution,
      format('Simulation cost, %s shares at $0.01', v_order.quantity), v_quote.as_of);

  if v_order.side = 'buy' then
    insert into public.positions (registration_id, student_id, instrument_id, quantity, cost_basis, updated_at)
    values (v_order.registration_id, v_order.student_id, v_order.instrument_id, v_order.quantity, -v_net, v_quote.as_of)
    on conflict (registration_id, instrument_id) do update
      set quantity = public.positions.quantity + excluded.quantity,
          cost_basis = public.positions.cost_basis + excluded.cost_basis,
          updated_at = excluded.updated_at;
  elsif v_position.quantity = v_order.quantity then
    delete from public.positions p
    where p.registration_id = v_order.registration_id and p.instrument_id = v_order.instrument_id;
  else
    update public.positions p
      set quantity = p.quantity - v_order.quantity, cost_basis = p.cost_basis - v_basis_out, updated_at = v_quote.as_of
      where p.registration_id = v_order.registration_id and p.instrument_id = v_order.instrument_id;
  end if;

  update public.orders o set status = 'filled', closed_at = v_quote.as_of, reason = null where o.id = v_order.id;
  perform public.ledger_release(v_order.id, 'filled', v_quote.as_of);
  return jsonb_build_object('status', 'filled', 'execution_id', v_execution);
end;
$$;

create function public.ledger_expire_order(p_order uuid, p_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.ledger_lock_order(p_order);
begin
  if v_order.id is null or v_order.status <> 'accepted' or p_at is null or p_at < v_order.expires_at then
    return false;
  end if;
  update public.orders o
    set status = 'expired', closed_at = o.expires_at, reason = 'Day order expired at the close without a qualifying quote.'
    where o.id = v_order.id;
  perform public.ledger_release(v_order.id, 'expired', v_order.expires_at);
  return true;
end;
$$;

-- Publication source -------------------------------------------------------------------------

-- Replaces the stub from 20261103120000_profiles.sql. Returns only ticker and weight of equity
-- from the owner's latest season book, and nothing when a holding has no stored quote.
create or replace function public.published_holdings_source(owner uuid)
returns table (ticker text, weight numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with book as (
    select r.id, r.cash
    from public.registrations r
    join public.seasons s on s.id = r.season_id
    where r.student_id = owner
    order by s.starts_at desc
    limit 1
  ),
  priced as (
    select p.instrument_id, p.quantity * q.price as value
    from public.positions p
    join book on book.id = p.registration_id
    left join lateral (
      select x.price from public.quotes x
      where x.instrument_id = p.instrument_id and x.as_of <= now()
      order by x.as_of desc, x.recorded_at desc
      limit 1
    ) q on true
  ),
  total as (
    select (select cash from book) + coalesce(sum(value), 0) as equity, bool_and(value is not null) as complete
    from priced
  )
  select pr.instrument_id, round(pr.value / t.equity, 4)
  from priced pr
  cross join total t
  where t.complete and t.equity > 0;
$$;

-- Seed data ---------------------------------------------------------------------------------

select public.ledger_create_season('fall-2026', 'Fall 2026', '2026-08-24 00:00:00 America/New_York', 5);

insert into public.instruments (id, name, kind, sector) values
  ('AAPL', 'Apple', 'stock', 'Technology'),
  ('MSFT', 'Microsoft', 'stock', 'Technology'),
  ('NVDA', 'NVIDIA', 'stock', 'Technology'),
  ('JPM', 'JPMorgan Chase', 'stock', 'Financials'),
  ('UNH', 'UnitedHealth', 'stock', 'Health care'),
  ('XOM', 'Exxon Mobil', 'stock', 'Energy'),
  ('CAT', 'Caterpillar', 'stock', 'Industrials'),
  ('AMZN', 'Amazon', 'stock', 'Consumer discretionary'),
  ('LLY', 'Eli Lilly', 'stock', 'Health care'),
  ('COST', 'Costco', 'stock', 'Consumer staples'),
  ('SPY', 'SPDR S&P 500 ETF', 'etf', 'Broad market'),
  ('VTI', 'Vanguard Total Stock Market ETF', 'etf', 'Broad market');

-- The fixed sample prices from src/lib/sample-data.ts, labeled sample. They are reference
-- prices for reserves and valuation in local runs, not vendor data.
insert into public.quotes (instrument_id, price, as_of, source) values
  ('AAPL', 228.42, '2026-11-02T20:00:00Z', 'sample'),
  ('MSFT', 418.65, '2026-11-02T20:00:00Z', 'sample'),
  ('NVDA', 136.80, '2026-11-02T20:00:00Z', 'sample'),
  ('JPM', 224.15, '2026-11-02T20:00:00Z', 'sample'),
  ('UNH', 542.30, '2026-11-02T20:00:00Z', 'sample'),
  ('XOM', 118.74, '2026-11-02T20:00:00Z', 'sample'),
  ('CAT', 392.50, '2026-11-02T20:00:00Z', 'sample'),
  ('AMZN', 198.40, '2026-11-02T20:00:00Z', 'sample'),
  ('LLY', 812.60, '2026-11-02T20:00:00Z', 'sample'),
  ('COST', 892.15, '2026-11-02T20:00:00Z', 'sample'),
  ('SPY', 572.40, '2026-11-02T20:00:00Z', 'sample'),
  ('VTI', 286.90, '2026-11-02T20:00:00Z', 'sample');

-- Function privileges -----------------------------------------------------------------------

revoke execute on function
  public.rounds_before_insert(),
  public.ledger_create_season(text, text, timestamptz, integer),
  public.ledger_session_for(timestamptz),
  public.ledger_order_window(timestamptz),
  public.latest_quotes(timestamptz),
  public.ledger_simulation_cost_per_share(),
  public.ledger_reserve_collar(),
  public.ledger_buy_reserve(integer, numeric),
  public.ledger_order_payload(uuid, boolean),
  public.ledger_registration_payload(uuid),
  public.ledger_register(uuid, text, timestamptz),
  public.register_for_season(text),
  public.ledger_accept_order(uuid, text, text, numeric, text, timestamptz),
  public.place_order(text, text, numeric, text),
  public.ledger_release(uuid, text, timestamptz),
  public.ledger_lock_order(uuid),
  public.ledger_cancel_order(uuid, uuid, timestamptz),
  public.cancel_order(uuid),
  public.ledger_fill_order(uuid, uuid, timestamptz),
  public.ledger_expire_order(uuid, timestamptz)
  from public, anon, authenticated;

revoke execute on function public.published_holdings_source(uuid) from public, anon, authenticated;

grant execute on function
  public.ledger_session_for(timestamptz),
  public.ledger_order_window(timestamptz),
  public.latest_quotes(timestamptz),
  public.ledger_simulation_cost_per_share(),
  public.ledger_reserve_collar(),
  public.ledger_buy_reserve(integer, numeric),
  public.register_for_season(text),
  public.place_order(text, text, numeric, text),
  public.cancel_order(uuid)
  to authenticated, service_role;

grant execute on function
  public.ledger_create_season(text, text, timestamptz, integer),
  public.ledger_register(uuid, text, timestamptz),
  public.ledger_accept_order(uuid, text, text, numeric, text, timestamptz),
  public.ledger_cancel_order(uuid, uuid, timestamptz),
  public.ledger_fill_order(uuid, uuid, timestamptz),
  public.ledger_expire_order(uuid, timestamptz),
  public.ledger_order_payload(uuid, boolean),
  public.ledger_registration_payload(uuid)
  to service_role;
