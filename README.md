# LandcoverTruthing

Collects ground-truth landcover labels from people who personally know the ground,
as training data for remote sensing classification of waterfowl habitat.

A contributor opens the link, drops a pin on a field they know, picks what was
planted there and in what year, and submits. Points pool into a Supabase table
that the project owner exports as CSV.

**Intended URL once deployed:** https://askrenr.github.io/LandcoverTruthing/ (not live yet — see Deployment below)

## Design

See [`docs/superpowers/specs/2026-07-30-landcover-truthing-design.md`](docs/superpowers/specs/2026-07-30-landcover-truthing-design.md).

## Landcover classes

`moist-soil`, `corn/dirty`, `rice/dirty`, `other ag/dirty`, `corn`, `rice`,
`millet`, `milo`, `sunflowers`, `other` (free text).

"dirty" means the crop was left with a weedy or volunteer understory rather than
clean-farmed. `floodable` records whether the ground *can* be flooded — the
infrastructure — not whether it was flooded when observed.

Years run from 2020 to the current year.

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

**Status:** the `askrenr/LandcoverTruthing` GitHub repo has not been created yet
and Pages has not been enabled. The workflow file above is ready to go, but
creating the repo, setting the build secrets, enabling Pages, and pushing are
deliberately left for the project owner to do by hand (see the task-14 brief,
steps 5–9) rather than performed automatically here.
