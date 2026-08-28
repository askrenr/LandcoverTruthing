-- LandcoverTruthing schema.
-- Run in the Supabase SQL editor. Safe to re-run: every statement is idempotent.

create extension if not exists "pgcrypto";

create table if not exists public.landcover_points (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  session_token     uuid not null,
  contributor_name  text not null,
  contributor_email text not null,
  latitude          double precision not null,
  longitude         double precision not null,
  landcover_class   text not null,
  class_other       text,
  harvested         text,
  year              integer not null,
  floodable         text not null,
  confidence        text not null,
  notes             text,
  placement_method  text not null,
  gps_accuracy_m    double precision,

  constraint latitude_range  check (latitude between -90 and 90),
  constraint longitude_range check (longitude between -180 and 180),

  constraint contributor_name_present
    check (length(trim(contributor_name)) > 0),
  constraint contributor_email_shape
    check (contributor_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),

  -- Adding a class here also needs an ALTER against any live database: the
  -- create-table-if-not-exists above is a no-op once the table exists, so
  -- re-running this file will not widen an existing constraint.
  constraint landcover_class_allowed check (landcover_class in (
    'moist-soil', 'corn/dirty', 'rice/dirty', 'other ag/dirty',
    'corn', 'rice', 'millet', 'milo', 'sunflowers',
    'floating leaf', 'buttonbush', 'willow', 'persistent emergent',
    'early forest', 'mature forest',
    'other'
  )),

  -- Free text is required for 'other' and forbidden otherwise, so the column
  -- never holds stale text from a class the contributor changed their mind about.
  constraint class_other_matches_class check (
    (landcover_class = 'other'
      and class_other is not null
      and length(trim(class_other)) > 0)
    or
    (landcover_class <> 'other' and class_other is null)
  ),

  -- Harvest only has an answer for a planted crop. Nullable rather than
  -- defaulted: rows written before this column existed genuinely do not know,
  -- and that is different from a contributor answering 'unknown'.
  constraint harvested_allowed check (
    harvested is null or harvested in ('yes', 'no', 'unknown')
  ),
  constraint harvested_only_for_ag check (
    harvested is null or landcover_class in (
      'corn/dirty', 'rice/dirty', 'other ag/dirty',
      'corn', 'rice', 'millet', 'milo', 'sunflowers'
    )
  ),

  -- Floor only. The current-year ceiling is enforced by a trigger, because
  -- now() is STABLE and a CHECK using it does not survive a dump/restore.
  constraint year_floor check (year >= 2020),

  constraint floodable_allowed  check (floodable in ('yes', 'no', 'unknown')),
  constraint confidence_allowed check (confidence in ('certain', 'fairly_sure', 'best_guess')),
  constraint placement_method_allowed check (
    placement_method in ('map_click', 'device_gps', 'coordinates', 'search')
  ),

  constraint gps_accuracy_only_for_device_gps check (
    placement_method = 'device_gps' or gps_accuracy_m is null
  ),

  constraint notes_length check (notes is null or length(notes) <= 1000)
);

create index if not exists landcover_points_session_token_idx
  on public.landcover_points (session_token);
create index if not exists landcover_points_created_at_idx
  on public.landcover_points (created_at desc);

-- Reads the browser's session token out of the PostgREST request headers.
-- Returns null for a missing or malformed header, which fails every policy closed.
create or replace function public.request_session_token()
returns uuid
language plpgsql
stable
as $$
declare
  raw text;
begin
  raw := current_setting('request.headers', true)::json ->> 'x-session-token';
  if raw is null or raw = '' then
    return null;
  end if;
  return raw::uuid;
exception
  when others then
    return null;
end;
$$;

-- Enforces the current-year ceiling, maintains updated_at, and rate-limits
-- inserts per session token.
create or replace function public.landcover_points_before_write()
returns trigger
language plpgsql
as $$
declare
  recent integer;
begin
  if new.year > extract(year from now())::integer then
    raise exception 'year % is in the future', new.year;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into recent
      from public.landcover_points
     where session_token = new.session_token
       and created_at > now() - interval '1 hour';
    if recent >= 500 then
      raise exception 'Rate limit exceeded: too many points from this session in the last hour';
    end if;
    new.created_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists landcover_points_before_write_trigger on public.landcover_points;
create trigger landcover_points_before_write_trigger
  before insert or update on public.landcover_points
  for each row execute function public.landcover_points_before_write();

-- Row-level security. RLS gates which rows; grants gate which verbs.
alter table public.landcover_points enable row level security;

grant select, insert, update, delete on public.landcover_points to anon;

drop policy if exists points_insert_own on public.landcover_points;
create policy points_insert_own on public.landcover_points
  for insert to anon
  with check (session_token = public.request_session_token());

drop policy if exists points_select_own on public.landcover_points;
create policy points_select_own on public.landcover_points
  for select to anon
  using (session_token = public.request_session_token());

drop policy if exists points_update_own on public.landcover_points;
create policy points_update_own on public.landcover_points
  for update to anon
  using (session_token = public.request_session_token())
  with check (session_token = public.request_session_token());

drop policy if exists points_delete_own on public.landcover_points;
create policy points_delete_own on public.landcover_points
  for delete to anon
  using (session_token = public.request_session_token());
