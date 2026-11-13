-- Row Level Security test: two accounts, each must see and change only its own rows.
-- Local run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/local_shim.sql -f supabase/migrations/0001_init.sql -f supabase/tests/rls_test.sql
-- Every check raises an exception on failure, so reaching "RLS OK" means all passed.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'second@example.test');

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as
  $$ begin if ok is not true then raise exception 'FAILED: %', what; end if; raise notice 'ok: %', what; end $$;
create function pg_temp.denied(stmt text, what text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok: % (%)', what, sqlerrm; return; end;
  raise exception 'FAILED: % was allowed', what;
end $$;

set role authenticated;

-- Account A: owner
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into cv_versions (id, name) values ('10000000-0000-0000-0000-00000000000a', 'General v1');
insert into applications (id, company, role_title) values ('20000000-0000-0000-0000-00000000000a', 'Fusion Lets', 'Consultant');
insert into settings (seeded) values (true);
select pg_temp.expect((select count(*) = 1 from status_events where to_status = 'Saved' and from_status is null), 'insert writes a status event');
select pg_temp.denied($$update applications set status = 'Applied' where id = '20000000-0000-0000-0000-00000000000a'$$, 'Applied without a CV version is refused');
update applications set status = 'Applied', cv_version_id = '10000000-0000-0000-0000-00000000000a' where id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) = 1 from status_events where from_status = 'Saved' and to_status = 'Applied' and changed_at is not null), 'a move writes a timestamped status event');
update applications set notes = 'x' where id = '20000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) = 2 from status_events), 'an edit without a status change writes no event');
insert into interviews (application_id, date_time) values ('20000000-0000-0000-0000-00000000000a', now());

-- Account B: second account
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) = 0 from applications), 'B cannot read A applications');
select pg_temp.expect((select count(*) = 0 from status_events), 'B cannot read A status events');
select pg_temp.expect((select count(*) = 0 from cv_versions), 'B cannot read A CV versions');
select pg_temp.expect((select count(*) = 0 from interviews), 'B cannot read A interviews');
select pg_temp.expect((select count(*) = 0 from settings), 'B cannot read A settings');
update applications set company = 'hacked';
update status_events set note = 'hacked';
update settings set weekly_target = 99;
delete from applications;
delete from cv_versions;
delete from interviews;
select pg_temp.denied($$insert into applications (user_id, company, role_title) values ('00000000-0000-0000-0000-00000000000a', 'x', 'y')$$, 'B cannot insert a row owned by A');
select pg_temp.denied($$insert into status_events (application_id, to_status) values ('20000000-0000-0000-0000-00000000000a', 'Offer')$$, 'B cannot add an event to A application');
select pg_temp.denied($$insert into interviews (application_id, date_time) values ('20000000-0000-0000-0000-00000000000a', now())$$, 'B cannot add an interview to A application');
select pg_temp.denied($$insert into applications (company, role_title, cv_version_id) values ('x', 'y', '10000000-0000-0000-0000-00000000000a')$$, 'B cannot attach A CV version');
insert into applications (company, role_title) values ('B Co', 'B role');
select pg_temp.expect((select count(*) = 1 from applications), 'B sees only its own application');

-- Signed out
set request.jwt.claim.sub = '';
select pg_temp.expect((select count(*) = 0 from applications), 'signed out sees nothing');
set role anon;
select pg_temp.expect((select count(*) = 0 from applications) and (select count(*) = 0 from cv_versions), 'anon sees nothing');
set role authenticated;

-- Back to A: everything intact
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select company = 'Fusion Lets' from applications), 'A application untouched by B');
select pg_temp.expect((select count(*) = 1 from applications) and (select count(*) = 2 from status_events) and (select count(*) = 1 from cv_versions)
  and (select count(*) = 1 from interviews) and (select weekly_target = 10 from settings), 'A rows all intact');
select pg_temp.denied($$delete from cv_versions$$, 'a CV version that was sent cannot be deleted');
reset role;
\echo RLS OK
