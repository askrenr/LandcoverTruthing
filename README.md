# LandcoverTruthing

Collects ground-truth landcover labels from people who personally know the ground,
as training data for remote sensing classification of waterfowl habitat.

A contributor opens the link, drops a pin on a spot they know, picks what was
growing there and in what year, and submits. Points pool into a Supabase table
that the project owner exports as CSV.

The app asks for location as soon as the contributor is known, so on a phone in
the field the pin lands where they are standing without a single tap. Refusing
the prompt costs nothing — tapping the map still works, as do the coordinate box
and place search at the bottom of the panel.

**Live at:** https://askrenr.github.io/LandcoverTruthing/

## Design

See [`docs/superpowers/specs/2026-07-30-landcover-truthing-design.md`](docs/superpowers/specs/2026-07-30-landcover-truthing-design.md).

## Landcover classes

Planted: `moist-soil`, `corn/dirty`, `rice/dirty`, `other ag/dirty`, `corn`,
`rice`, `millet`, `milo`, `sunflowers`.

Natural wetland vegetation: `floating leaf`, `buttonbush`, `willow`,
`persistent emergent`.

Forest, by successional stage: `early forest`, `mature forest`.

Plus `other` (free text).

"dirty" means the crop was left with a weedy or volunteer understory rather than
clean-farmed. `floodable` records whether the ground *can* be flooded — the
infrastructure — not whether it was flooded when observed.

Years run from 2020 to the current year.

## Harvested

The eight planted-crop classes — `corn/dirty`, `rice/dirty`, `other ag/dirty`,
`corn`, `rice`, `millet`, `milo`, `sunflowers` — also ask whether the crop was
harvested (`yes` / `no` / `unknown`). Every other class stores `harvested` as
null: `moist-soil` is managed for waterfowl rather than taken off the field, the
natural wetland classes were never planted, and `other` is free text.

Null therefore means two things that are worth telling apart in analysis: the
class cannot be harvested, or the point was recorded before this field existed
(anything submitted before 2026-08-09). A contributor who was asked and did not
know is stored as `unknown`, not null.

## Local development

```bash
npm install
cp .env.example .env    # fill in the Supabase project URL and anon key
npm run dev             # http://localhost:5173/LandcoverTruthing/
npm test                # unit tests
npm run build           # typecheck + production build
```

Without a `.env`, the app runs but submissions fail with a "not configured"
message. Everything else works.

## Database

`supabase/schema.sql` creates the table, constraints, and row-level security
policies. Run it in the Supabase SQL editor, then run `supabase/verify.sql`,
which asserts each constraint rejects what it should and cleans up after itself.

**On an existing database, schema.sql will not add a new column.** Its
`create table if not exists` is a no-op once the table is there, so every schema
change also ships as a file in `supabase/migrations/`, to be run by hand in the
SQL editor.

**Run `migrations/2026-08-09-add-harvested.sql` before pushing this version.**
Pushing to `main` deploys immediately, and the client sends the `harvested` key
on *every* point, including the classes that store it as null — so until the
column exists, PostgREST rejects every submission, not just the crop ones.

Security model: the anon key is public by design and ships in the JS bundle.
Row-level security confines each browser to rows matching its `session_token`,
which travels in the `x-session-token` request header. Insert is open to anyone
with the link; every row carries a name, email, and timestamp, so bad batches are
identifiable and removable in one query.

## Exporting the data

Supabase dashboard → Table Editor → `landcover_points` → Export as CSV.

**The export contains contributor email addresses. Treat it as PII.**

Contributors can download their own points from within the app; that file
excludes `session_token`, which is a bearer secret.

## Known limits

- The in-app "your points" list lives in browser local storage, so it is
  per-browser. Clearing site data empties the list; the points themselves remain
  in the database.
- Supabase free-tier projects pause after seven days of inactivity. The first
  request after a pause is slow while the project wakes.
- There is no offline queue. A submission that fails leaves the form filled so
  the contributor can retry.
- Place search uses OSM Nominatim, which is rate-limited to roughly one request
  per second and is debounced accordingly.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`. The Supabase URL and anon key come from
repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The repo exists and the workflow is in place. A schema change is the one thing
that does not ride along with a push: run the outstanding file in
`supabase/migrations/` first, then push, or the newly deployed client writes
against a column the database does not have yet.

The repo is private while the Pages site is public, which GitHub permits for a
`build_type=workflow` Pages deployment — changing repo visibility to "fix" this
is not necessary.
