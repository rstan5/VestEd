-- University affiliation, clubs, memberships, and admin review.
-- Students hold SELECT only. Every change goes through a SECURITY DEFINER function
-- that authorizes the caller from auth.uid(), never from an argument.

create table public.universities (
  id text primary key
    constraint universities_id_format check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  short_name text not null
);

create table public.university_domains (
  domain text primary key
    constraint university_domains_format check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  university_id text not null references public.universities (id) on delete cascade
);

insert into public.universities (id, name, short_name) values
  ('michigan', 'University of Michigan', 'Michigan'),
  ('penn', 'University of Pennsylvania', 'Pennsylvania'),
  ('texas', 'University of Texas', 'Texas'),
  ('virginia', 'University of Virginia', 'Virginia'),
  ('nyu', 'New York University', 'NYU'),
  ('berkeley', 'University of California, Berkeley', 'Berkeley'),
  ('notre-dame', 'University of Notre Dame', 'Notre Dame'),
  ('georgetown', 'Georgetown University', 'Georgetown');

insert into public.university_domains (domain, university_id) values
  ('umich.edu', 'michigan'),
  ('upenn.edu', 'penn'),
  ('utexas.edu', 'texas'),
  ('virginia.edu', 'virginia'),
  ('nyu.edu', 'nyu'),
  ('berkeley.edu', 'berkeley'),
  ('nd.edu', 'notre-dame'),
  ('georgetown.edu', 'georgetown');

-- Reviewers. Rows are added by an operator with database access, never through the API.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.university_affiliations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles (id) on delete cascade,
  university_id text not null references public.universities (id),
  email text not null
    constraint university_affiliations_email_format check (email = lower(btrim(email)) and char_length(email) <= 254),
  status text not null default 'pending'
    constraint university_affiliations_status check (status in ('pending', 'verified', 'rejected')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  constraint university_affiliations_decision check ((status = 'pending') = (decided_at is null))
);

comment on column public.university_affiliations.status is
  'A matching email domain only creates a pending row. Verified is set by a separate review decision.';

create unique index university_affiliations_email_claim
  on public.university_affiliations (email) where status <> 'rejected';

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint clubs_name_length check (char_length(btrim(name)) between 3 and 80),
  thesis text
    constraint clubs_thesis_length check (char_length(thesis) <= 400),
  university_id text references public.universities (id),
  created_by uuid references public.profiles (id) on delete set null,
  official_status text not null default 'pending_review'
    constraint clubs_official_status check (official_status in ('pending_review', 'official', 'not_official')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column public.clubs.official_status is
  'Student-created clubs start in pending_review. Only an admin review sets official.';

create unique index clubs_name_unique on public.clubs (lower(btrim(name)));

create table public.club_memberships (
  club_id uuid not null references public.clubs (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    constraint club_memberships_role check (role in ('founder', 'moderator', 'member')),
  status text not null default 'pending'
    constraint club_memberships_status check (status in ('pending', 'active', 'rejected', 'withdrawn', 'removed', 'left')),
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (club_id, student_id),
  constraint club_memberships_leaders_active check (role = 'member' or status = 'active')
);

-- A student belongs to at most one club, and each club has exactly one founder.
create unique index club_memberships_one_active_club
  on public.club_memberships (student_id) where status = 'active';
create unique index club_memberships_one_founder
  on public.club_memberships (club_id) where role = 'founder';

create table public.club_disputes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  filed_by uuid references public.profiles (id) on delete set null,
  reason text not null
    constraint club_disputes_reason_length check (char_length(btrim(reason)) between 10 and 1000),
  status text not null default 'admin_review'
    constraint club_disputes_status check (status in ('admin_review', 'upheld', 'dismissed')),
  filed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  constraint club_disputes_resolution check ((status = 'admin_review') = (resolved_at is null))
);

create unique index club_disputes_one_open
  on public.club_disputes (club_id) where status = 'admin_review';

alter table public.universities enable row level security;
alter table public.university_domains enable row level security;
alter table public.app_admins enable row level security;
alter table public.university_affiliations enable row level security;
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_disputes enable row level security;

revoke all on table
  public.universities, public.university_domains, public.app_admins,
  public.university_affiliations, public.clubs, public.club_memberships, public.club_disputes
  from anon, authenticated;
grant select on table
  public.universities, public.university_domains,
  public.university_affiliations, public.clubs, public.club_memberships, public.club_disputes
  to authenticated;

-- Authorization helpers ------------------------------------------------------

create function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
    or exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

create function public.club_role_of(p_club uuid, p_student uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.club_memberships m
  where m.club_id = p_club and m.student_id = p_student and m.status = 'active';
$$;

create function public.is_club_leader(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.club_role_of(p_club, (select auth.uid())) in ('founder', 'moderator'), false);
$$;

create function public.campus_require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;
  return v_uid;
end;
$$;

create function public.campus_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'admin_only';
  end if;
end;
$$;

-- Read policies --------------------------------------------------------------

create policy universities_read on public.universities
  for select to authenticated using (true);

create policy university_domains_read on public.university_domains
  for select to authenticated using (true);

create policy university_affiliations_owner_read on public.university_affiliations
  for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_app_admin()));

create policy clubs_read on public.clubs
  for select to authenticated using (true);

create policy club_memberships_read on public.club_memberships
  for select to authenticated
  using (status = 'active' or student_id = (select auth.uid()) or public.is_club_leader(club_id));

create policy club_disputes_read on public.club_disputes
  for select to authenticated
  using (filed_by = (select auth.uid()) or public.is_club_leader(club_id) or (select public.is_app_admin()));

-- University affiliation -----------------------------------------------------

create function public.request_university_affiliation(p_email text)
returns table (id uuid, university_id text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_domain text;
  v_university text;
  v_row public.university_affiliations;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;
  v_domain := split_part(v_email, '@', 2);

  select d.university_id into v_university
  from public.university_domains d
  where v_domain = d.domain or right(v_domain, char_length(d.domain) + 1) = '.' || d.domain
  order by char_length(d.domain) desc
  limit 1;
  if v_university is null then
    raise exception using errcode = 'P0001', message = 'unknown_university_domain';
  end if;

  if exists (
    select 1 from public.university_affiliations a
    where a.email = v_email and a.student_id <> v_uid and a.status <> 'rejected'
  ) then
    raise exception using errcode = '23505', message = 'email_already_claimed';
  end if;

  select * into v_row from public.university_affiliations a where a.student_id = v_uid for update;
  -- Resubmitting the same address never downgrades a verified row or restarts a pending one.
  if found and v_row.email = v_email and v_row.status in ('pending', 'verified') then
    return query select v_row.id, v_row.university_id, v_row.status;
    return;
  end if;

  insert into public.university_affiliations as a (student_id, university_id, email)
  values (v_uid, v_university, v_email)
  on conflict (student_id) do update
    set university_id = excluded.university_id,
        email = excluded.email,
        status = 'pending',
        submitted_at = now(),
        decided_at = null,
        decided_by = null
  returning * into v_row;

  return query select v_row.id, v_row.university_id, v_row.status;
end;
$$;

create function public.decide_university_affiliation(p_affiliation uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.campus_require_admin();
  if p_decision not in ('verified', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  update public.university_affiliations a
    set status = p_decision, decided_at = now(), decided_by = (select auth.uid())
    where a.id = p_affiliation and a.status = 'pending'
    returning a.status into v_status;
  if v_status is null then
    raise exception using errcode = 'P0002', message = 'no_pending_affiliation';
  end if;
  return v_status;
end;
$$;

create function public.my_university_affiliation()
returns table (
  id uuid,
  university_id text,
  university_name text,
  email text,
  status text,
  submitted_at timestamptz,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.university_id, u.name, a.email, a.status, a.submitted_at, a.decided_at
  from public.university_affiliations a
  join public.universities u on u.id = a.university_id
  where a.student_id = (select auth.uid());
$$;

-- Clubs ----------------------------------------------------------------------

create function public.create_club(p_name text, p_thesis text default null, p_university text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_thesis text := nullif(btrim(coalesce(p_thesis, '')), '');
  v_university text := nullif(btrim(coalesce(p_university, '')), '');
  v_club uuid;
begin
  if char_length(v_name) not between 3 and 80 then
    raise exception using errcode = '22023', message = 'invalid_club_name';
  end if;
  if char_length(v_thesis) > 400 then
    raise exception using errcode = '22023', message = 'invalid_club_thesis';
  end if;
  if v_university is not null and not exists (select 1 from public.universities u where u.id = v_university) then
    raise exception using errcode = '22023', message = 'unknown_university';
  end if;
  if exists (select 1 from public.club_memberships m where m.student_id = v_uid and m.status = 'active') then
    raise exception using errcode = 'P0001', message = 'already_in_club';
  end if;
  if exists (select 1 from public.clubs c where lower(btrim(c.name)) = lower(v_name)) then
    raise exception using errcode = '23505', message = 'club_name_taken';
  end if;

  insert into public.clubs (name, thesis, university_id, created_by)
  values (v_name, v_thesis, v_university, v_uid)
  returning id into v_club;

  update public.club_memberships m
    set status = 'withdrawn', decided_at = now(), decided_by = v_uid, updated_at = now()
    where m.student_id = v_uid and m.status = 'pending';

  insert into public.club_memberships (club_id, student_id, role, status, decided_at, decided_by)
  values (v_club, v_uid, 'founder', 'active', now(), v_uid);

  return v_club;
end;
$$;

create function public.apply_to_club(p_club uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_official text;
  v_existing text;
begin
  select c.official_status into v_official from public.clubs c where c.id = p_club;
  if v_official is null then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;
  if v_official = 'not_official' then
    raise exception using errcode = 'P0001', message = 'club_closed';
  end if;
  if exists (select 1 from public.club_memberships m where m.student_id = v_uid and m.status = 'active') then
    raise exception using errcode = 'P0001', message = 'already_in_club';
  end if;

  select m.status into v_existing
  from public.club_memberships m
  where m.club_id = p_club and m.student_id = v_uid
  for update;

  if v_existing = 'pending' then
    return 'pending';
  elsif v_existing = 'rejected' then
    raise exception using errcode = 'P0001', message = 'application_already_rejected';
  elsif v_existing is null then
    insert into public.club_memberships (club_id, student_id) values (p_club, v_uid);
  else
    update public.club_memberships m
      set status = 'pending', role = 'member', applied_at = now(), decided_at = null, decided_by = null, updated_at = now()
      where m.club_id = p_club and m.student_id = v_uid;
  end if;
  return 'pending';
end;
$$;

create function public.withdraw_club_application(p_club uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
begin
  update public.club_memberships m
    set status = 'withdrawn', decided_at = now(), decided_by = v_uid, updated_at = now()
    where m.club_id = p_club and m.student_id = v_uid and m.status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'no_pending_application';
  end if;
  return 'withdrawn';
end;
$$;

create function public.decide_club_application(p_club uuid, p_student uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_actor text := public.club_role_of(p_club, v_uid);
begin
  if v_actor is null or v_actor not in ('founder', 'moderator') then
    raise exception using errcode = '42501', message = 'not_club_leader';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  perform 1 from public.club_memberships m
    where m.club_id = p_club and m.student_id = p_student and m.status = 'pending'
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'no_pending_application';
  end if;

  if p_decision = 'reject' then
    update public.club_memberships m
      set status = 'rejected', decided_at = now(), decided_by = v_uid, updated_at = now()
      where m.club_id = p_club and m.student_id = p_student;
    return 'rejected';
  end if;

  if exists (select 1 from public.club_memberships m where m.student_id = p_student and m.status = 'active') then
    raise exception using errcode = 'P0001', message = 'applicant_in_other_club';
  end if;
  update public.club_memberships m
    set status = 'active', role = 'member', decided_at = now(), decided_by = v_uid, updated_at = now()
    where m.club_id = p_club and m.student_id = p_student;
  update public.club_memberships m
    set status = 'withdrawn', decided_at = now(), decided_by = p_student, updated_at = now()
    where m.student_id = p_student and m.status = 'pending';
  return 'active';
end;
$$;

create function public.set_club_member_role(p_club uuid, p_student uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_target text;
begin
  if p_student = v_uid then
    raise exception using errcode = '42501', message = 'cannot_change_own_role';
  end if;
  if public.club_role_of(p_club, v_uid) is distinct from 'founder' then
    raise exception using errcode = '42501', message = 'founder_only';
  end if;
  if p_role not in ('moderator', 'member') then
    raise exception using errcode = '22023', message = 'invalid_role';
  end if;
  v_target := public.club_role_of(p_club, p_student);
  if v_target is null then
    raise exception using errcode = 'P0002', message = 'not_a_member';
  end if;
  update public.club_memberships m
    set role = p_role, updated_at = now()
    where m.club_id = p_club and m.student_id = p_student;
  return p_role;
end;
$$;

create function public.remove_club_member(p_club uuid, p_student uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_actor text := public.club_role_of(p_club, v_uid);
  v_target text;
begin
  if v_actor is null or v_actor not in ('founder', 'moderator') then
    raise exception using errcode = '42501', message = 'not_club_leader';
  end if;
  if p_student = v_uid then
    raise exception using errcode = 'P0001', message = 'use_leave_club';
  end if;
  v_target := public.club_role_of(p_club, p_student);
  if v_target is null then
    raise exception using errcode = 'P0002', message = 'not_a_member';
  end if;
  if v_target = 'founder' then
    raise exception using errcode = '42501', message = 'cannot_remove_founder';
  end if;
  if v_target = 'moderator' and v_actor <> 'founder' then
    raise exception using errcode = '42501', message = 'founder_only';
  end if;
  update public.club_memberships m
    set role = 'member', status = 'removed', decided_at = now(), decided_by = v_uid, updated_at = now()
    where m.club_id = p_club and m.student_id = p_student;
  return 'removed';
end;
$$;

create function public.leave_club(p_club uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_role text := public.club_role_of(p_club, v_uid);
begin
  if v_role is null then
    raise exception using errcode = 'P0002', message = 'not_a_member';
  end if;
  if v_role = 'founder' then
    raise exception using errcode = 'P0001', message = 'founder_must_transfer';
  end if;
  update public.club_memberships m
    set role = 'member', status = 'left', decided_at = now(), decided_by = v_uid, updated_at = now()
    where m.club_id = p_club and m.student_id = v_uid;
  return 'left';
end;
$$;

create function public.transfer_club_leadership(p_club uuid, p_student uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
begin
  if public.club_role_of(p_club, v_uid) is distinct from 'founder' then
    raise exception using errcode = '42501', message = 'founder_only';
  end if;
  if exists (select 1 from public.club_disputes d where d.club_id = p_club and d.status = 'admin_review') then
    raise exception using errcode = 'P0001', message = 'club_under_review';
  end if;
  if p_student = v_uid then
    raise exception using errcode = 'P0001', message = 'already_founder';
  end if;
  if public.club_role_of(p_club, p_student) is null then
    raise exception using errcode = 'P0002', message = 'not_a_member';
  end if;
  update public.club_memberships m set role = 'moderator', updated_at = now()
    where m.club_id = p_club and m.student_id = v_uid;
  update public.club_memberships m set role = 'founder', updated_at = now()
    where m.club_id = p_club and m.student_id = p_student;
  return 'founder';
end;
$$;

-- Disputes and admin review --------------------------------------------------

create function public.file_club_dispute(p_club uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.campus_require_uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if not exists (select 1 from public.clubs c where c.id = p_club) then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;
  if char_length(v_reason) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_dispute_reason';
  end if;
  if exists (select 1 from public.club_disputes d where d.club_id = p_club and d.status = 'admin_review') then
    raise exception using errcode = 'P0001', message = 'dispute_already_open';
  end if;
  insert into public.club_disputes (club_id, filed_by, reason)
  values (p_club, v_uid, v_reason)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.review_club(p_club uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.campus_require_admin();
  if p_decision not in ('official', 'not_official') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  if exists (select 1 from public.club_disputes d where d.club_id = p_club and d.status = 'admin_review') then
    raise exception using errcode = 'P0001', message = 'club_under_review';
  end if;
  update public.clubs c
    set official_status = p_decision, reviewed_at = now(), reviewed_by = (select auth.uid())
    where c.id = p_club
    returning c.official_status into v_status;
  if v_status is null then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;
  return v_status;
end;
$$;

create function public.resolve_club_dispute(p_dispute uuid, p_outcome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
begin
  perform public.campus_require_admin();
  if p_outcome not in ('upheld', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_decision';
  end if;
  update public.club_disputes d
    set status = p_outcome, resolved_at = now(), resolved_by = (select auth.uid())
    where d.id = p_dispute and d.status = 'admin_review'
    returning d.club_id into v_club;
  if v_club is null then
    raise exception using errcode = 'P0002', message = 'no_open_dispute';
  end if;
  if p_outcome = 'upheld' then
    update public.clubs c
      set official_status = 'not_official', reviewed_at = now(), reviewed_by = (select auth.uid())
      where c.id = v_club;
  end if;
  return p_outcome;
end;
$$;

create function public.admin_review_queue()
returns table (kind text, item_id uuid, club_id uuid, title text, detail text, submitted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.campus_require_admin();
  return query
    select 'club_official'::text, c.id, c.id, c.name, coalesce(c.thesis, ''), c.created_at
    from public.clubs c
    where c.official_status = 'pending_review'
      and not exists (select 1 from public.club_disputes d where d.club_id = c.id and d.status = 'admin_review')
    union all
    select 'club_dispute'::text, d.id, d.club_id, c.name, d.reason, d.filed_at
    from public.club_disputes d
    join public.clubs c on c.id = d.club_id
    where d.status = 'admin_review'
    union all
    select 'university_affiliation'::text, a.id, null::uuid, u.name, a.email, a.submitted_at
    from public.university_affiliations a
    join public.universities u on u.id = a.university_id
    where a.status = 'pending'
    order by 6;
end;
$$;

-- Safe projections -----------------------------------------------------------

create function public.club_directory(p_club uuid default null)
returns table (
  id uuid,
  name text,
  thesis text,
  university_id text,
  university_name text,
  official_status text,
  under_dispute boolean,
  is_official boolean,
  member_count integer,
  founder_id uuid,
  founder_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.thesis,
    c.university_id,
    u.short_name,
    c.official_status,
    d.open,
    c.official_status = 'official' and not d.open,
    (select count(*)::int from public.club_memberships m where m.club_id = c.id and m.status = 'active'),
    f.student_id,
    p.display_name,
    c.created_at
  from public.clubs c
  left join public.universities u on u.id = c.university_id
  cross join lateral (
    select exists (select 1 from public.club_disputes x where x.club_id = c.id and x.status = 'admin_review') as open
  ) d
  left join public.club_memberships f on f.club_id = c.id and f.role = 'founder'
  left join public.profiles p on p.id = f.student_id
  where (p_club is null or c.id = p_club)
    and (select auth.uid()) is not null
  order by (c.official_status = 'official' and not d.open) desc, c.created_at desc;
$$;

create function public.club_roster(p_club uuid)
returns table (student_id uuid, display_name text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.student_id, p.display_name, m.role, coalesce(m.decided_at, m.applied_at)
  from public.club_memberships m
  join public.profiles p on p.id = m.student_id
  where m.club_id = p_club
    and m.status = 'active'
    and (select auth.uid()) is not null
  order by case m.role when 'founder' then 0 when 'moderator' then 1 else 2 end, p.display_name;
$$;

create function public.club_applications(p_club uuid)
returns table (student_id uuid, display_name text, status text, applied_at timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.student_id, p.display_name, m.status, m.applied_at, m.decided_at
  from public.club_memberships m
  join public.profiles p on p.id = m.student_id
  where m.club_id = p_club
    and m.status in ('pending', 'rejected')
    and public.is_club_leader(p_club)
  order by (m.status = 'pending') desc, m.applied_at;
$$;

create function public.my_club_memberships()
returns table (
  club_id uuid,
  club_name text,
  role text,
  status text,
  applied_at timestamptz,
  decided_at timestamptz,
  official_status text,
  under_dispute boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.club_id, c.name, m.role, m.status, m.applied_at, m.decided_at, c.official_status,
    exists (select 1 from public.club_disputes d where d.club_id = c.id and d.status = 'admin_review')
  from public.club_memberships m
  join public.clubs c on c.id = m.club_id
  where m.student_id = (select auth.uid())
  order by (m.status = 'active') desc, m.updated_at desc;
$$;

-- What other students may see about someone's campus ties. Pending affiliations stay private.
create function public.public_campus(target uuid)
returns table (verified_university text, club_id uuid, club_name text, club_role text, club_official boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select u.name from public.university_affiliations a
       join public.universities u on u.id = a.university_id
       where a.student_id = target and a.status = 'verified'),
    m.club_id,
    c.name,
    m.role,
    c.official_status = 'official'
      and not exists (select 1 from public.club_disputes d where d.club_id = c.id and d.status = 'admin_review')
  from (select 1) one
  left join public.club_memberships m on m.student_id = target and m.status = 'active'
  left join public.clubs c on c.id = m.club_id
  where (select auth.uid()) is not null
    and exists (select 1 from public.profiles p where p.id = target);
$$;

-- Function privileges --------------------------------------------------------

revoke execute on function
  public.club_role_of(uuid, uuid),
  public.campus_require_uid(),
  public.campus_require_admin()
  from public, anon, authenticated;

revoke execute on function
  public.is_app_admin(),
  public.is_club_leader(uuid),
  public.request_university_affiliation(text),
  public.decide_university_affiliation(uuid, text),
  public.my_university_affiliation(),
  public.create_club(text, text, text),
  public.apply_to_club(uuid),
  public.withdraw_club_application(uuid),
  public.decide_club_application(uuid, uuid, text),
  public.set_club_member_role(uuid, uuid, text),
  public.remove_club_member(uuid, uuid),
  public.leave_club(uuid),
  public.transfer_club_leadership(uuid, uuid),
  public.file_club_dispute(uuid, text),
  public.review_club(uuid, text),
  public.resolve_club_dispute(uuid, text),
  public.admin_review_queue(),
  public.club_directory(uuid),
  public.club_roster(uuid),
  public.club_applications(uuid),
  public.my_club_memberships(),
  public.public_campus(uuid)
  from public, anon;

grant execute on function
  public.is_app_admin(),
  public.is_club_leader(uuid),
  public.request_university_affiliation(text),
  public.decide_university_affiliation(uuid, text),
  public.my_university_affiliation(),
  public.create_club(text, text, text),
  public.apply_to_club(uuid),
  public.withdraw_club_application(uuid),
  public.decide_club_application(uuid, uuid, text),
  public.set_club_member_role(uuid, uuid, text),
  public.remove_club_member(uuid, uuid),
  public.leave_club(uuid),
  public.transfer_club_leadership(uuid, uuid),
  public.file_club_dispute(uuid, text),
  public.review_club(uuid, text),
  public.resolve_club_dispute(uuid, text),
  public.admin_review_queue(),
  public.club_directory(uuid),
  public.club_roster(uuid),
  public.club_applications(uuid),
  public.my_club_memberships(),
  public.public_campus(uuid)
  to authenticated, service_role;
