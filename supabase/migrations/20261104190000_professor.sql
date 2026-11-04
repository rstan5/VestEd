-- Saved Professor conversations. A student reads only their own sessions and messages.
-- Students have no write grant. The app server records each turn through
-- professor_record_turn with the server-only role, after it has taken the student from the
-- session token, so a student cannot author a Professor reply or write into another
-- student's conversation. A reply status can only be demonstration or unavailable: there is
-- no value for a live model reply until a provider is connected.

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_sessions_student_recent on public.ai_sessions (student_id, updated_at desc);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('student', 'professor')),
  body text not null check (char_length(body) between 1 and 6000),
  reply_status text,
  context jsonb,
  created_at timestamptz not null default now(),
  constraint ai_messages_reply_status check (
    (role = 'student' and reply_status is null and context is null)
    or (role = 'professor' and reply_status in ('demonstration', 'unavailable'))
  )
);

create index ai_messages_session_order on public.ai_messages (session_id, id);

alter table public.ai_sessions enable row level security;
alter table public.ai_messages enable row level security;

revoke all on table public.ai_sessions, public.ai_messages from public, anon, authenticated;
grant select on table public.ai_sessions, public.ai_messages to authenticated;
grant all on table public.ai_sessions, public.ai_messages to service_role;

create policy ai_sessions_owner_read on public.ai_sessions
  for select to authenticated using (student_id = (select auth.uid()));

create policy ai_messages_owner_read on public.ai_messages
  for select to authenticated using (student_id = (select auth.uid()));

create function public.professor_message_limit() returns integer
language sql immutable set search_path = '' as $$ select 200 $$;

-- Records one student question and the Professor reply. A null session starts a new
-- conversation titled from the question. A session that is not the student's is not found.
create function public.professor_record_turn(
  p_student uuid,
  p_session uuid,
  p_question text,
  p_reply_status text,
  p_reply text,
  p_context jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_question text := btrim(coalesce(p_question, ''));
  v_session uuid := p_session;
begin
  if p_student is null or not exists (select 1 from public.profiles p where p.id = p_student) then
    raise exception using errcode = 'P0002', message = 'no_profile';
  end if;
  if char_length(v_question) = 0 or char_length(v_question) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_question';
  end if;
  if p_reply_status is null or p_reply_status not in ('demonstration', 'unavailable') then
    raise exception using errcode = 'P0001', message = 'invalid_reply_status';
  end if;

  if v_session is null then
    insert into public.ai_sessions (student_id, title)
    values (p_student, left(regexp_replace(v_question, '\s+', ' ', 'g'), 80))
    returning id into v_session;
  else
    perform 1 from public.ai_sessions s where s.id = v_session and s.student_id = p_student for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'conversation_not_found';
    end if;
    if (select count(*) from public.ai_messages m where m.session_id = v_session) + 2 > public.professor_message_limit() then
      raise exception using errcode = 'P0001', message = 'conversation_full';
    end if;
  end if;

  insert into public.ai_messages (session_id, student_id, role, body)
  values (v_session, p_student, 'student', v_question);
  insert into public.ai_messages (session_id, student_id, role, body, reply_status, context)
  values (v_session, p_student, 'professor', p_reply, p_reply_status, p_context);
  update public.ai_sessions set updated_at = now() where id = v_session;
  return v_session;
end;
$$;

revoke execute on function public.professor_message_limit(), public.professor_record_turn(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.professor_message_limit(), public.professor_record_turn(uuid, uuid, text, text, text, jsonb)
  to service_role;
