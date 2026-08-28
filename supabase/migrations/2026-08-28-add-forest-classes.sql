-- Adds the 'early forest' and 'mature forest' landcover classes.
--
-- Run this against the live database. schema.sql cannot do it: its
-- create-table-if-not-exists is a no-op once the table exists, so widening the
-- constraint there only affects a database built from scratch. A class the
-- dropdown offers but the database rejects loses the contributor's entry,
-- because the app writes through on submit — so this runs before the deploy.
--
-- Safe to re-run: the constraint is dropped and recreated rather than altered.
-- No existing row changes; this only widens what is accepted.

alter table public.landcover_points
  drop constraint if exists landcover_class_allowed;
alter table public.landcover_points
  add constraint landcover_class_allowed check (landcover_class in (
    'moist-soil', 'corn/dirty', 'rice/dirty', 'other ag/dirty',
    'corn', 'rice', 'millet', 'milo', 'sunflowers',
    'floating leaf', 'buttonbush', 'willow', 'persistent emergent',
    'early forest', 'mature forest',
    'other'
  ));

-- Forest is not an agricultural class, so harvested stays null for it and
-- harvested_only_for_ag needs no change.
