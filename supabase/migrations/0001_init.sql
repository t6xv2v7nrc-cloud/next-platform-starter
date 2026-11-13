-- Job Application Tracker: schema, status event trigger and Row Level Security.
-- Run once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

create type app_status as enum (
  'Saved', 'Applied', 'Screening', 'Interview', 'Final interview', 'Offer', 'Accepted',
  'Rejected', 'Withdrawn', 'No response'
);
create type app_source as enum ('Indeed', 'Company site', 'Recruiter', 'Referral', 'Other');
create type app_sector as enum (
  'Property and lettings', 'Housing and local authority', 'Research and investigations',
  'Legal', 'Operations', 'Other'
);
create type work_mode as enum ('On-site', 'Hybrid', 'Remote');
create type contract_type as enum ('Permanent', 'Fixed term', 'Temporary', 'Contract');
create type pay_unit as enum ('year', 'day', 'hour');
create type conflict_risk as enum ('Low', 'Medium', 'High');
create type interview_type as enum ('Phone', 'Video', 'In person', 'Assessment');

create table cv_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  file_path text,            -- path in the private "cvs" Storage bucket
  file_name text,            -- original file name, for display
  created_on date not null default current_date,
  focus text,
  change_summary text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null check (length(trim(company)) > 0),
  role_title text not null check (length(trim(role_title)) > 0),
  job_url text,
  source app_source not null default 'Indeed',
  sector app_sector not null default 'Other',
  location text,
  work_mode work_mode,
  contract_type contract_type,
  pay_min numeric,
  pay_max numeric,
  pay_unit pay_unit,
  date_found date,
  date_applied date,
  closing_date date,
  cv_version_id uuid references cv_versions (id) on delete restrict,
  cover_letter boolean not null default false,
  status app_status not null default 'Saved',
  fit_score smallint check (fit_score between 1 and 5),
  conflict_risk conflict_risk,
  next_action text,
  next_action_date date,
  contact_name text,
  contact_email text,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No version, no save: a CV version is required once an application is Applied or later.
  constraint cv_required_once_applied
    check (status in ('Saved', 'Withdrawn') or cv_version_id is not null)
);

create table status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references applications (id) on delete cascade,
  from_status app_status,
  to_status app_status not null,
  changed_at timestamptz not null default now(),
  note text
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references applications (id) on delete cascade,
  date_time timestamptz not null,
  type interview_type not null default 'Video',
  interviewer text,
  questions_asked text,
  how_it_went smallint check (how_it_went between 1 and 5),
  notes text
);

-- One row per user. Also records whether the seed data has been loaded.
create table settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  weekly_target integer not null default 10 check (weekly_target >= 0),
  no_response_days integer not null default 21 check (no_response_days > 0),
  day_multiplier numeric not null default 220 check (day_multiplier > 0),
  hour_multiplier numeric not null default 1950 check (hour_multiplier > 0),
  seeded boolean not null default false
);

create index on applications (user_id, status);
create index on status_events (application_id, changed_at);
create index on interviews (application_id);

-- Every status change writes an event; the funnel and timing charts are built from these.
create function log_status_event() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into status_events (user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into status_events (user_id, application_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return null;
end $$;

create trigger applications_status_event
  after insert or update of status on applications
  for each row execute function log_status_event();

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger applications_touch
  before update on applications
  for each row execute function touch_updated_at();

-- Row Level Security: owner only, on every table.
alter table cv_versions enable row level security;
alter table applications enable row level security;
alter table status_events enable row level security;
alter table interviews enable row level security;
alter table settings enable row level security;

create policy owner_all on cv_versions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on applications for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (cv_version_id is null or exists (
      select 1 from cv_versions v where v.id = cv_version_id and v.user_id = auth.uid()))
  );

create policy owner_all on status_events for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid())
  );

create policy owner_all on interviews for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid())
  );

create policy owner_all on settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
