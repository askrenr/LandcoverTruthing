-- Adds the `harvested` field for the agricultural landcover classes.
--
-- Run this against the live database. schema.sql cannot do it: its
-- create-table-if-not-exists is a no-op once the table exists, so the column
-- and its constraints there only apply to a database built from scratch.
--
-- Safe to re-run. Existing rows keep harvested = null, which is the honest
-- value for a point recorded before the question was asked — distinct from a
-- contributor who answered 'unknown'.
--
-- Note: on a migrated database this column lands at the end of the column
-- list, whereas a database built fresh from schema.sql has it after
-- class_other. The column order differs; nothing that reads by name cares.

alter table public.landcover_points
  add column if not exists harvested text;

alter table public.landcover_points
  drop constraint if exists harvested_allowed;
alter table public.landcover_points
  add constraint harvested_allowed check (
    harvested is null or harvested in ('yes', 'no', 'unknown')
  );

-- Keeps a harvest answer from attaching to ground that cannot be harvested:
-- the natural wetland classes, 'other', and 'moist-soil', which is managed for
-- waterfowl rather than taken off the field.
alter table public.landcover_points
  drop constraint if exists harvested_only_for_ag;
alter table public.landcover_points
  add constraint harvested_only_for_ag check (
    harvested is null or landcover_class in (
      'corn/dirty', 'rice/dirty', 'other ag/dirty',
      'corn', 'rice', 'millet', 'milo', 'sunflowers'
    )
  );
