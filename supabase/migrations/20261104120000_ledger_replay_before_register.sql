-- An idempotency key belongs to the student, not to a season. Resolve an existing key before
-- registration so a replay after the season closes, or during a later season, returns the
-- original order and never opens or credits another season's book.

create function public.ledger_replayed_order(
  p_student uuid,
  p_key text,
  p_instrument text,
  p_side text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.orders;
begin
  select * into v_existing from public.orders o
  where o.student_id = p_student and o.idempotency_key = p_key;
  if not found then
    return null;
  end if;
  if v_existing.instrument_id = p_instrument
    and v_existing.side = p_side
    and p_quantity is not null
    and v_existing.quantity::numeric = p_quantity then
    return public.ledger_order_payload(v_existing.id, true);
  end if;
  raise exception using errcode = '23505', message = 'idempotency_conflict';
end;
$$;

revoke execute on function public.ledger_replayed_order(uuid, text, text, text, numeric) from public, anon, authenticated;

create or replace function public.ledger_accept_order(
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
  v_replay jsonb;
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

  v_replay := public.ledger_replayed_order(p_student, v_key, v_instrument_id, v_side, p_quantity);
  if v_replay is not null then
    return v_replay;
  end if;

  -- Locking the book serializes every order, cancel, and fill for this student.
  -- Registration runs as its own statement so the lock below sees a row it just inserted.
  v_registration_id := public.ledger_register(p_student, null, p_at);
  select * into v_registration from public.registrations r
  where r.id = v_registration_id
  for update;
  select * into v_season from public.seasons s where s.id = v_registration.season_id;

  -- A concurrent first submit with the same key may have committed while this call waited on the lock.
  v_replay := public.ledger_replayed_order(p_student, v_key, v_instrument_id, v_side, p_quantity);
  if v_replay is not null then
    return v_replay;
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
