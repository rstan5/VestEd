begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('c3c3c3c3-1111-4111-8111-111111111111', 'prof-owner@example.test', '{"display_name":"Prof Owner"}', 'authenticated', 'authenticated'),
  ('d4d4d4d4-2222-4222-8222-222222222222', 'prof-other@example.test', '{"display_name":"Prof Other"}', 'authenticated', 'authenticated');

select is(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.ai_sessions'::regclass, 'public.ai_messages'::regclass)),
  true,
  'row level security is enabled on ai_sessions and ai_messages'
);

-- The server records turns ------------------------------------------------------------------
select set_config(
  'professor.session',
  public.professor_record_turn('c3c3c3c3-1111-4111-8111-111111111111', null, '  Where is my   book concentrated? ', 'demonstration', 'Demonstration reply.', '{"portfolio":"ready"}')::text,
  true
);
select is(
  (select title from public.ai_sessions where id = current_setting('professor.session')::uuid),
  'Where is my book concentrated?',
  'a new conversation is titled from the question'
);
select is(
  public.professor_record_turn('c3c3c3c3-1111-4111-8111-111111111111', current_setting('professor.session')::uuid, 'And cash?', 'unavailable', 'Unavailable.', null),
  current_setting('professor.session')::uuid,
  'a follow-up is recorded in the same conversation'
);
select is(
  (select string_agg(role || ':' || coalesce(reply_status, '-'), ',' order by id) from public.ai_messages where session_id = current_setting('professor.session')::uuid),
  'student:-,professor:demonstration,student:-,professor:unavailable',
  'turns are stored in order with their reply status'
);
select throws_ok(
  $$ select public.professor_record_turn('c3c3c3c3-1111-4111-8111-111111111111', null, 'hi', 'live', 'I am a model', null) $$,
  'P0001', 'invalid_reply_status', 'a reply cannot be stored as a live model reply'
);
select throws_ok(
  $$ select public.professor_record_turn('d4d4d4d4-2222-4222-8222-222222222222', current_setting('professor.session')::uuid, 'hi', 'demonstration', 'x', null) $$,
  'P0002', 'conversation_not_found', 'another student''s conversation cannot be written to'
);
select throws_ok(
  $$ select public.professor_record_turn('c3c3c3c3-1111-4111-8111-111111111111', null, '   ', 'demonstration', 'x', null) $$,
  'P0001', 'invalid_question', 'an empty question is rejected'
);
select throws_ok(
  $$ insert into public.ai_messages (session_id, student_id, role, body, reply_status) values (current_setting('professor.session')::uuid, 'c3c3c3c3-1111-4111-8111-111111111111', 'student', 'x', 'demonstration') $$,
  '23514', null, 'a student message cannot carry a reply status'
);

-- Owner -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3c3c3c3-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.ai_sessions), 1, 'owner reads their conversation');
select is((select count(*)::int from public.ai_messages), 4, 'owner reads their messages');
select throws_ok(
  $$ select public.professor_record_turn('c3c3c3c3-1111-4111-8111-111111111111', null, 'hi', 'demonstration', 'forged', null) $$,
  '42501', null, 'a student cannot record a turn or author a reply'
);
select throws_ok(
  $$ insert into public.ai_sessions (student_id, title) values ('c3c3c3c3-1111-4111-8111-111111111111', 'forged') $$,
  '42501', null, 'owner cannot insert a conversation directly'
);
select throws_ok(
  $$ insert into public.ai_messages (session_id, student_id, role, body) values (current_setting('professor.session')::uuid, 'c3c3c3c3-1111-4111-8111-111111111111', 'professor', 'forged') $$,
  '42501', null, 'owner cannot insert a message directly'
);
select throws_ok($$ update public.ai_messages set body = 'edited' $$, '42501', null, 'owner cannot edit messages');
select throws_ok($$ delete from public.ai_sessions $$, '42501', null, 'owner cannot delete conversations directly');

-- Another student -------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4d4d4d4-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.ai_sessions), 0, 'another student cannot see the conversation');
select is((select count(*)::int from public.ai_messages), 0, 'another student cannot read the messages');
select is(
  (select count(*)::int from public.ai_messages where session_id = current_setting('professor.session')::uuid),
  0,
  'naming the conversation id reveals nothing'
);

-- Signed out --------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select count(*) from public.ai_messages $$, '42501', null, 'a signed-out visitor cannot read messages');
select throws_ok($$ select count(*) from public.ai_sessions $$, '42501', null, 'a signed-out visitor cannot read conversations');

reset role;
select * from finish();
rollback;
