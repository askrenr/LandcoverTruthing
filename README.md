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

A caption in the bottom-left corner of the map gives the capture date of the
aerial imagery under the map centre, so a contributor can see whether the
picture is old enough to disagree with the year they are labelling.

**Live at:** https://askrenr.github.io/LandcoverTruthing/

## Design

See [`docs/superpowers/specs/2026-07-30-landcover-truthing-design.md`](docs/superpowers/specs/2026-07-30-landcover-truthing-design.md).

## Landcover classes

Definitions are the project owner's; the dropdown offers exactly these sixteen,
in this order.

| Class | Definition |
| --- | --- |
| `moist-soil` | Vegetation dominated by annual and perennial early successional wetland associated species. These areas should be associated with manipulative or natural annual drawdowns of surface water. |
| `corn/dirty` | Corn, grown outside of typical agricultural practices (little to no herbicide, often mixed in with other moist-soil plants). |
| `rice/dirty` | Rice, grown outside of typical agricultural practices (little to no herbicide, often mixed in with other moist-soil plants). |
| `other ag/dirty` | Other agricultural plants, grown outside of typical agricultural practices (little to no herbicide, often mixed in with other moist-soil plants). |
| `corn` | Planted corn. |
| `rice` | Planted rice. |
| `millet` | Planted, cultivated millets (jap, golden, chiwappa, etc.). |
| `milo` | Milo. |
| `sunflowers` | Sunflowers. |
| `floating leaf` | Permanent wetland / or shallow pond areas dominated by floating vegetation (Lily, Lotus, Duckweed). For context, I would classify much of the Neosho Sanctuary as Floating Leaf. |
| `buttonbush` | Buttonbush (will likely be clumped with willow as scrub shrub). |
| `willow` | Willow. |
| `persistent emergent` | Permanent wetland dominated by perennial emergent aquatic plants (cattail, reed, bulrush, perennial smartweeds, etc.). |
| `early forest` | Bottomland hardwood forest in mid-successional stages (>scrub shrub, >20 ft tall). |
| `mature forest` | Forest with mature bottomland tree species. |
| `other` | Please make notes if you have a cover type that doesn't fit well in these other categories. |

`floodable` records whether the ground *can* be flooded — the
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
- The imagery date comes from Esri's own footprints for the World Imagery
  basemap and describes the map centre only — the frame can straddle two
  scenes flown years apart. Below about zoom 12 the basemap is an undated 15 m
  mosaic, and the caption says so rather than borrowing a date from the
  high-resolution scene underneath it.

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
