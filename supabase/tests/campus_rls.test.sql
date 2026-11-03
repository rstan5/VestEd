begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

-- f… founder, a… approved then moderator, b… rejected, c… outsider, d… later applicant
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('f0000000-0000-4000-8000-000000000001', 'fay@example.test', '{"display_name":"Fay Founder"}', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000002', 'ada@example.test', '{"display_name":"Ada Applicant"}', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000003', 'ben@example.test', '{"display_name":"Ben Rejected"}', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000004', 'ola@example.test', '{"display_name":"Ola Outsider"}', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000005', 'nia@example.test', '{"display_name":"Nia Newcomer"}', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from pg_class
   where relnamespace = 'public'::regnamespace and relrowsecurity
     and relname in ('universities', 'university_domains', 'app_admins', 'university_affiliations', 'clubs', 'club_memberships', 'club_disputes')),
  7,
  'row level security is enabled on every campus table'
);

-- University affiliation ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select status from public.request_university_affiliation('  Ada@UMich.edu ')),
  'pending',
  'a matching university domain creates a pending affiliation'
);
select is(
  (select status from public.university_affiliations where student_id = 'a0000000-0000-4000-8000-000000000002'),
  'pending',
  'the stored affiliation is pending, not verified'
);
select throws_ok(
  $$ select * from public.request_university_affiliation('ada@gmail.com') $$,
  'P0001', 'unknown_university_domain',
  'an unrecognized domain does not start verification'
);
select throws_ok(
  $$ update public.university_affiliations set status = 'verified' $$,
  '42501', null,
  'a student cannot mark their own affiliation verified'
);
select throws_ok(
  $$ select public.decide_university_affiliation((select id from public.university_affiliations limit 1), 'verified') $$,
  '42501', 'admin_only',
  'a student cannot approve their own verification'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (select university_id from public.request_university_affiliation('ola@med.umich.edu')),
  'michigan',
  'a subdomain of a university domain matches that university'
);
select throws_ok(
  $$ select * from public.request_university_affiliation('ada@umich.edu') $$,
  '23505', 'email_already_claimed',
  'another student cannot claim the same university email'
);
select is(
  (select count(*)::int from public.university_affiliations),
  1,
  'a student sees only their own affiliation'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.decide_university_affiliation(
    (select id from public.university_affiliations where student_id = 'a0000000-0000-4000-8000-000000000002'),
    'verified'),
  'verified',
  'a separate review decision verifies the affiliation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select status from public.request_university_affiliation('ada@umich.edu')),
  'verified',
  'resubmitting the verified address does not put it back to pending'
);
select is(
  (select verified_university from public.public_campus('c0000000-0000-4000-8000-000000000004')),
  null,
  'a pending affiliation is not published as verified'
);

reset role;
select is(
  (select string_agg(status, ',' order by status) from public.university_affiliations
   where student_id in ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004')),
  'pending,verified',
  'pending and verified are distinct stored states'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(
  (select verified_university from public.public_campus('a0000000-0000-4000-8000-000000000002')),
  'University of Michigan',
  'a verified university is visible to other students'
);

-- Club creation and applications ----------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select isnt(
  public.create_club('pgTAP Campus Fund', 'Long-horizon value investing.', 'michigan'),
  null::uuid,
  'a student can create a club'
);
select is(
  (select official_status from public.clubs where name = 'pgTAP Campus Fund'),
  'pending_review',
  'a student-created club starts in admin review'
);
select is(
  (select is_official from public.club_directory((select id from public.clubs where name = 'pgTAP Campus Fund'))),
  false,
  'a student-created club is not official'
);
select is(
  (select role from public.club_memberships
   where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')
     and student_id = 'f0000000-0000-4000-8000-000000000001'),
  'founder',
  'the creator becomes the founder'
);
select throws_ok(
  $$ select public.create_club('Second Fund', null, null) $$,
  'P0001', 'already_in_club',
  'a founder cannot start a second club'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.apply_to_club((select id from public.clubs where name = 'pgTAP Campus Fund')), 'pending', 'a student can apply to a club');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.apply_to_club((select id from public.clubs where name = 'pgTAP Campus Fund')), 'pending', 'a second student can apply');

-- Non-leaders cannot change membership
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$ select public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002', 'approve') $$,
  '42501', 'not_club_leader',
  'a non-leader cannot approve an application'
);
select throws_ok(
  $$ select public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'b0000000-0000-4000-8000-000000000003', 'reject') $$,
  '42501', 'not_club_leader',
  'a non-leader cannot reject an application'
);
select throws_ok(
  $$ update public.club_memberships set status = 'active' where student_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a non-leader cannot update membership rows directly'
);
select throws_ok(
  $$ insert into public.club_memberships (club_id, student_id, role, status)
     values ((select id from public.clubs where name = 'pgTAP Campus Fund'), 'c0000000-0000-4000-8000-000000000004', 'member', 'active') $$,
  '42501', null,
  'a non-leader cannot add a member row'
);
select throws_ok(
  $$ delete from public.club_memberships where student_id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a non-leader cannot delete membership rows'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002', 'approve') $$,
  '42501', 'not_club_leader',
  'an applicant cannot approve their own application'
);

reset role;
select is(
  (select status || ':' || role from public.club_memberships
   where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')
     and student_id = 'a0000000-0000-4000-8000-000000000002'),
  'pending:member',
  'the unauthorized attempts left the application row unchanged'
);
select is(
  (select count(*)::int from public.club_memberships
   where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund') and status = 'active'),
  1,
  'only the founder is an active member after the unauthorized attempts'
);

-- Founder decisions
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002', 'approve'),
  'active',
  'the founder approves one applicant'
);
select is(
  public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'b0000000-0000-4000-8000-000000000003', 'reject'),
  'rejected',
  'the founder rejects the other applicant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select status from public.club_memberships where student_id = 'a0000000-0000-4000-8000-000000000002'),
  'active',
  'the approved applicant sees the approval'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select status from public.my_club_memberships()),
  'rejected',
  'the rejected applicant sees the rejection'
);
select throws_ok(
  $$ select public.apply_to_club((select id from public.clubs where name = 'pgTAP Campus Fund')) $$,
  'P0001', 'application_already_rejected',
  'a rejected applicant cannot reapply to the same club'
);
select is(
  (select count(*)::int from public.club_roster((select id from public.clubs where name = 'pgTAP Campus Fund'))
   where student_id = 'b0000000-0000-4000-8000-000000000003'),
  0,
  'the rejected applicant is not on the roster'
);
select is(
  (select count(*)::int from public.club_roster((select id from public.clubs where name = 'pgTAP Campus Fund'))),
  2,
  'the roster has the founder and the approved member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_club_member((select id from public.clubs where name = 'pgTAP Campus Fund'), 'f0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_club_leader',
  'a plain member cannot remove members'
);

-- Moderators ------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.set_club_member_role((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002', 'moderator'),
  'moderator',
  'the founder assigns a member as moderator'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_club_member_role((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002', 'founder') $$,
  '42501', 'cannot_change_own_role',
  'a moderator cannot promote themselves'
);
select throws_ok(
  $$ select public.transfer_club_leadership((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002') $$,
  '42501', 'founder_only',
  'a moderator cannot take club leadership'
);
select throws_ok(
  $$ update public.club_memberships set role = 'founder' where student_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a moderator cannot rewrite their role directly'
);
select throws_ok(
  $$ select public.remove_club_member((select id from public.clubs where name = 'pgTAP Campus Fund'), 'f0000000-0000-4000-8000-000000000001') $$,
  '42501', 'cannot_remove_founder',
  'a moderator cannot remove the founder'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select public.apply_to_club((select id from public.clubs where name = 'pgTAP Campus Fund'));

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  public.decide_club_application((select id from public.clubs where name = 'pgTAP Campus Fund'), 'd0000000-0000-4000-8000-000000000005', 'approve'),
  'active',
  'a moderator can approve applications'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_club_member((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002') $$,
  '42501', 'not_club_leader',
  'a plain member cannot remove a moderator'
);

reset role;
select is(
  (select string_agg(student_id::text || '=' || role, ',' order by student_id) from public.club_memberships
   where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund') and status = 'active'),
  'a0000000-0000-4000-8000-000000000002=moderator,d0000000-0000-4000-8000-000000000005=member,f0000000-0000-4000-8000-000000000001=founder',
  'roles are unchanged after the rejected promotion and removal attempts'
);

-- Disputes and admin review -----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select isnt(
  public.file_club_dispute((select id from public.clubs where name = 'pgTAP Campus Fund'), 'This name belongs to an existing registered society.'),
  null::uuid,
  'a student can raise a dispute about a club'
);

reset role;
select is(
  (select status from public.club_disputes where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')),
  'admin_review',
  'the dispute is queued for admin review'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolve_club_dispute((select id from public.club_disputes where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')), 'dismissed') $$,
  '42501', 'admin_only',
  'the founder cannot resolve the dispute'
);
select throws_ok(
  $$ update public.club_disputes set status = 'dismissed', resolved_at = now() where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund') $$,
  '42501', null,
  'the founder cannot close the dispute directly'
);
select throws_ok(
  $$ select public.transfer_club_leadership((select id from public.clubs where name = 'pgTAP Campus Fund'), 'a0000000-0000-4000-8000-000000000002') $$,
  'P0001', 'club_under_review',
  'leadership cannot change while the club is under admin review'
);
select throws_ok(
  $$ select public.review_club((select id from public.clubs where name = 'pgTAP Campus Fund'), 'official') $$,
  '42501', 'admin_only',
  'a founder cannot make their own club official'
);
select throws_ok(
  $$ update public.clubs set official_status = 'official' where name = 'pgTAP Campus Fund' $$,
  '42501', null,
  'a founder cannot write official status directly'
);
select is(
  public.remove_club_member((select id from public.clubs where name = 'pgTAP Campus Fund'), 'd0000000-0000-4000-8000-000000000005'),
  'removed',
  'the founder can still manage ordinary membership during review'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolve_club_dispute((select id from public.club_disputes where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')), 'upheld') $$,
  '42501', 'admin_only',
  'a moderator cannot resolve the dispute'
);

reset role;
select is(
  (select status from public.club_disputes where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')),
  'admin_review',
  'membership changes did not close the dispute'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(
  (select under_dispute::text || ',' || is_official::text from public.club_directory((select id from public.clubs where name = 'pgTAP Campus Fund'))),
  'true,false',
  'a disputed club is shown as under review and not official'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*)::int from public.admin_review_queue()
   where kind = 'club_dispute' and club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')),
  1,
  'the dispute appears in the admin review queue'
);
select throws_ok(
  $$ select public.review_club((select id from public.clubs where name = 'pgTAP Campus Fund'), 'official') $$,
  'P0001', 'club_under_review',
  'a disputed club cannot become official before the dispute is resolved'
);
select is(
  public.resolve_club_dispute((select id from public.club_disputes where club_id = (select id from public.clubs where name = 'pgTAP Campus Fund')), 'dismissed'),
  'dismissed',
  'an admin resolves the dispute'
);
select is(
  public.review_club((select id from public.clubs where name = 'pgTAP Campus Fund'), 'official'),
  'official',
  'an admin approves official status'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(
  (select is_official from public.club_directory((select id from public.clubs where name = 'pgTAP Campus Fund'))),
  true,
  'after admin approval the club is official'
);
select throws_ok(
  $$ select * from public.admin_review_queue() $$,
  '42501', 'admin_only',
  'students cannot read the admin review queue'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.club_directory() $$,
  '42501', null,
  'anon cannot read the club directory'
);
select throws_ok(
  $$ select * from public.clubs $$,
  '42501', null,
  'anon cannot read the clubs table'
);

select * from finish();
rollback;
