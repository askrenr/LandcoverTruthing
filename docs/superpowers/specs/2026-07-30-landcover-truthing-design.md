# LandcoverTruthing — Design

**Date:** 2026-07-30
**Status:** Approved

## Purpose

Collect ground-truth landcover labels from people who personally know the ground —
farmers, land managers, guides, biologists — as training data for remote sensing
classification of waterfowl habitat.

A contributor opens a link, drops a pin on a field they know, picks what was planted
there and in what year, and submits. Points from all contributors pool into one
database that the project owner exports as a CSV.

## Scope

**In scope (v1):** pin placement, a fixed landcover class list, year, floodability,
confidence, notes, pooled storage, per-contributor session list with edit/delete,
per-contributor CSV download, owner CSV export via the Supabase dashboard.

**Out of scope (v1):** photo upload, acreage entry, historical imagery basemaps,
multiple year/class pairs per pin, in-app admin export page, contributor accounts
with passwords, offline support.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | Pooled backend + per-contributor local download | One export for the owner; contributors get a receipt of their own work |
| Identity | Name + email, collected once, no password | Provenance for QA without a login wall |
| Class list | Fixed, config-driven | Prevents spelling variance; editable without touching UI code |
| Flooding | `floodable` (potential), not observed state | Owner cares about impoundment capability; observed state is derivable from Sentinel-1 |
| Knowledge source | Ground knowledge | Map is a locator, not evidence — no historical imagery needed |
| Years per pin | One | Simplest schema and form; re-drop for another year |
| Backend | Supabase (hosted Postgres) | Free tier, insert-only RLS, real column constraints |
| Geographic bounds | None | Project scope may expand |
| Year floor | 2020 | Keeps human recall accuracy high |
| Owner export | Supabase dashboard only | No admin page, no Edge Function, no extra attack surface |
| Extra fields | Notes + confidence | Escape hatch and a QA filter; every added field is friction on every submission |
| Layout | Fully responsive | Desk sessions and in-field use are both expected |
| Submit flow | Immediate save + editable session list | Durability of immediate save, reviewability of a batch |

## Architecture

Static frontend, hosted Postgres, no server-side application code.

- **Frontend:** Vite + React + TypeScript, built to static files.
- **Hosting:** GitHub Pages from the `LandcoverTruthing` repo under `askrenr`,
  deployed by a GitHub Action on push to `main`. Public URL:
  `https://askrenr.github.io/LandcoverTruthing/`
- **Map:** Leaflet. Basemaps: Esri World Imagery (default), a labeled street layer,
  and a hybrid imagery + labels option. Place search via OSM Nominatim.
- **Backend:** Supabase free tier. One table, written directly from the browser with
  the public anon key. Row-level security is the only enforcement layer.

### Accepted constraints

- The Supabase anon key is public in the JS bundle by design. Security comes entirely
  from row-level policies.
- Supabase free-tier projects pause after seven days of inactivity and wake on the
  next request; the first request after a pause is slow.
- Nominatim is rate-limited and requires attribution. Acceptable at this volume.

## Data model

Table `landcover_points`, one row per submitted pin.

| column | type | constraints |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | set on update |
| `session_token` | uuid | NOT NULL; random per browser |
| `contributor_name` | text | NOT NULL |
| `contributor_email` | text | NOT NULL |
| `latitude` | double precision | NOT NULL, `BETWEEN -90 AND 90` |
| `longitude` | double precision | NOT NULL, `BETWEEN -180 AND 180` |
| `landcover_class` | text | NOT NULL, `CHECK` in class list |
| `class_other` | text | NOT NULL when `landcover_class = 'other'`, else NULL |
| `year` | integer | NOT NULL, `>= 2020 AND <= EXTRACT(YEAR FROM now())` |
| `floodable` | text | NOT NULL, in (`yes`, `no`, `unknown`) |
| `confidence` | text | NOT NULL, in (`certain`, `fairly_sure`, `best_guess`) |
| `notes` | text | nullable |
| `placement_method` | text | NOT NULL, in (`map_click`, `device_gps`, `coordinates`, `search`) |
| `gps_accuracy_m` | double precision | nullable; set only when `placement_method = 'device_gps'` |

All constraints are enforced as database `CHECK`s, not only in the form.

### Landcover class list

Fixed, defined in one TypeScript config file:

```
moist-soil
corn/dirty
rice/dirty
other ag/dirty
corn
rice
millet
milo
sunflowers
other        ← the only value that reveals a free-text box
```

"dirty" denotes a crop left with weedy/volunteer understory rather than clean-farmed.

Adding a class later = one config edit + a migration to the `CHECK` constraint.

### CSV export

The owner exports the table from the Supabase dashboard. Columns are the table columns
verbatim, one row per point. **The export contains contributor emails — treat it as PII.**

The contributor-facing "Download my points (CSV)" exports from browser local storage
using the same column set. It reads from local storage rather than querying the
database, so it works instantly and offline even though the SELECT policy would also
permit a contributor to read back their own rows.

## User interface

### First visit

Intro card explaining the project and what is being asked for, plus a name + email
form. Stored in local storage, asked once per browser. An "edit my info" link in the
header allows typo correction.

### Main screen

Map plus form panel. Panel is right-side at desktop widths and a bottom sheet on
phones; one breakpoint, same components.

### Placing a pin

Four methods, all setting `placement_method`:

1. Click/tap the map (`map_click`)
2. "Use my location" via device geolocation (`device_gps`, also records `gps_accuracy_m`)
3. Lat/long paste box (`coordinates`) — accepts decimal degrees and common DMS formats
4. Place search via Nominatim (`search`)

The pin is draggable after placement.

### Form

Fields in order: class (free-text box appears only for `other`), year (dropdown,
2020 → current year, descending), floodable, confidence, notes.

- Class and year default to empty — no unconsidered default should be submittable.
- Floodable defaults to `unknown`; confidence defaults to `certain`.
- Submit is disabled until required fields are set, with the blocking reason displayed.

### After submit

Point saves immediately, a marker drops on the map, and the point appears at the top
of the session list. The form clears **but retains year and floodable** — contributors
typically work one year at a time.

### Session list

Every point from that browser, each with edit and delete; edits write through to the
database. A "Download my points (CSV)" button exports from local storage.

The list is per-browser. Clearing cache loses the local list although the points
remain in the database. The UI states this plainly next to the download button.

## Security

Four row-level security policies on `landcover_points`:

- **INSERT** — permitted for the anonymous role.
- **SELECT** — only rows whose `session_token` matches the requester's token.
- **UPDATE** — same restriction.
- **DELETE** — same restriction.

No policy permits reading another contributor's rows, so the table cannot be enumerated.

### Accepted risks

- `session_token` is a bearer secret in local storage. It separates contributors from
  each other; it is not a defense against a determined attacker with developer tools.
- Insert is open, so anyone with the URL can submit junk. Mitigations: a rate limit on
  inserts per session token, and the fact that every row carries name, email, and
  timestamp, making bad batches identifiable and removable in a single query.
- No CAPTCHA. It is friction on real contributors against a threat unlikely to
  materialize for a link shared with known people.

## Testing

Vitest with React Testing Library, written test-first. Supabase is mocked at the
client boundary.

Covered:

- Coordinate parsing across decimal-degree and DMS input formats
- Form validation rules, including submit-disabled reasons
- The `other`-requires-free-text conditional
- CSV generation and escaping (notes will contain commas, quotes, and newlines)
- Local-storage round-tripping of contributor info and session points
- Session-list edit and delete behavior

Database `CHECK` constraints are verified once directly against the real Supabase
table — an untested constraint is not a constraint.

## Delivery stages

Each stage is independently usable.

1. **Local-only app** — map, all four pin placement methods, form, validation, session
   list, CSV download. Persists to local storage. No backend.
2. **Backend wired** — Supabase table, constraints, and RLS policies live; submissions,
   edits, and deletes write through.
3. **Responsive polish and deploy** — breakpoint layout, intro/identity flow,
   GitHub Action deploying to GitHub Pages.

## Default map view

First-time visitors land centered on the Lower Mississippi Alluvial Valley at
`34.5, -91.0`, zoom 7 — wide enough to show eastern Arkansas and the Delta, close
enough that a contributor recognizes where they are. Defined in the same config file
as the class list. This is a starting view only; there is no geographic restriction on
where pins may be placed.

## Setup prerequisites

These require account access and must be done before stage 2:

- Create the Supabase project; record the project URL and anon key.
- Create the `askrenr/LandcoverTruthing` GitHub repo and enable Pages.
