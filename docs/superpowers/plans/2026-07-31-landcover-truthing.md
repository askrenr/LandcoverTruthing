# LandcoverTruthing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where people who know the ground drop a GPS pin, pick a landcover class and year, and submit it into a pooled database the project owner exports as CSV training data.

**Architecture:** Static React frontend on GitHub Pages writing directly to Supabase Postgres via the public anon key, with row-level security as the only enforcement layer. Pure logic (coordinate parsing, CSV, validation, storage) lives in `src/lib/` as dependency-free modules that are unit-tested exhaustively; React components are thin shells over them. Stage 1 delivers a fully working local-storage-only app before any backend exists.

**Tech Stack:** Vite, React 19, TypeScript, Leaflet 1.9 + react-leaflet, supabase-js 2, Vitest + React Testing Library, jsdom.

**Resolved versions (as installed in Task 1 — these are the actuals, not a target):** Node 26.0.0, Vite 8.2, TypeScript 7.0, Vitest 4.1, jsdom 30.0, React 19.2, @vitejs/plugin-react 6.0, @testing-library/react 16.3, @testing-library/jest-dom 7.0. The plan was drafted against older majors; `npm install` resolved newer ones. Do not "correct" a file to match an older major mentioned elsewhere in this plan.

**Form validation note (Task 7, verified necessary):** any `<form>` that does its own validation and renders its own error messages must carry the `noValidate` attribute. Without it, the browser's native constraint validation on inputs like `type="email"` silently blocks submission before the `onSubmit` handler runs, so the custom error never renders — and in jsdom the failure is invisible, with no console warning. Empirically confirmed in `IdentityGate.tsx`: removing `noValidate` fails 2 of its 10 tests. `noValidate` is correct in production too, since the whole point is to show our own messages rather than the browser's default bubble. `PointForm` (Task 8) uses only `select` and `textarea` and so does not need it, but apply the same treatment to any form that later gains a constrained input type.

**Known environment workaround (Task 1, verified necessary):** Node 26 ships a default-on experimental global `localStorage` that is `undefined`, and Vitest 4's jsdom environment will not overwrite a global that already exists unless it is on an internal allowlist — which `localStorage`/`sessionStorage` are not. Node's broken stub therefore shadows jsdom's working implementation. `src/testSetup.ts` restores both from `globalThis.jsdom.window` and is consequently ~20 lines rather than the one-line import shown in Task 1's step. This was empirically confirmed: with the one-line version, `expect(localStorage).toBeDefined()` fails. Every task that touches storage depends on this shim. It is correct as written — do not revert it to match the Task 1 text.

## Global Constraints

- **Repo root:** `/Users/ryanaskren/LandcoverTruthing`. Already a git repo with the spec committed.
- **Spec:** `docs/superpowers/specs/2026-07-30-landcover-truthing-design.md` — authoritative; this plan implements it.
- **Landcover classes (exact strings, exact order):** `moist-soil`, `corn/dirty`, `rice/dirty`, `other ag/dirty`, `corn`, `rice`, `millet`, `milo`, `sunflowers`, `other`
- **`other` is the only class that reveals a free-text box**, and free text is then required.
- **Year floor is 2020**; ceiling is the current year, computed at runtime, never hardcoded.
- **`floodable`** ∈ `yes` | `no` | `unknown`, default `unknown`. Means *could this be flooded* (infrastructure), not *was it flooded*.
- **`confidence`** ∈ `certain` | `fairly_sure` | `best_guess`, default `certain`.
- **`placement_method`** ∈ `map_click` | `device_gps` | `coordinates` | `search`.
- **Class and year have no default** — an unconsidered value must not be submittable.
- **Database column names are snake_case; TypeScript properties are camelCase.** Mapping happens only in `src/lib/mapping.ts` (Task 4).
- **No geographic restriction** on where pins may be placed.
- **Default map view:** `34.5, -91.0`, zoom 7.
- **GitHub Pages base path:** `/LandcoverTruthing/` — required in `vite.config.ts`.
- **Every task ends with a commit.** Conventional commit prefixes (`feat:`, `test:`, `chore:`).
- **TDD is mandatory:** write the failing test, watch it fail, implement minimally, watch it pass.

### Deliberate deviations from the spec

Two, both to be noted in the README:

1. **`session_token` is excluded from the in-app CSV export.** The spec says the contributor CSV mirrors the table columns; `session_token` is a bearer secret and writing it into a file the contributor may email around is a needless leak. The owner's Supabase dashboard export still contains it.
2. **The year ceiling is a trigger, not a `CHECK`.** `CHECK (year <= extract(year from now()))` uses a STABLE function, which makes the constraint non-reproducible across dump/restore. A `BEFORE INSERT OR UPDATE` trigger enforces the same rule and survives a restore. The immutable floor stays a `CHECK`.

---

## File Structure

```
LandcoverTruthing/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                  # includes Vitest config; base: '/LandcoverTruthing/'
├── .env.example                    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── .gitignore
├── README.md
├── src/
│   ├── main.tsx                    # React root
│   ├── App.tsx                     # top-level wiring and state (Task 11)
│   ├── styles.css                  # all styling, one file (Task 14)
│   ├── types.ts                    # shared domain types (Task 2)
│   ├── config.ts                   # class list, options, year range, map defaults (Task 2)
│   ├── lib/
│   │   ├── coordinates.ts          # DD + DMS parsing, formatting (Task 3)
│   │   ├── mapping.ts              # camelCase <-> snake_case row mapping (Task 4)
│   │   ├── csv.ts                  # RFC 4180 CSV generation (Task 4)
│   │   ├── validation.ts           # draft validation rules (Task 5)
│   │   ├── storage.ts              # localStorage persistence (Task 6)
│   │   ├── geocode.ts              # Nominatim place search (Task 10)
│   │   └── supabaseClient.ts       # client + insert/update/delete (Task 13)
│   └── components/
│       ├── IdentityGate.tsx        # first-visit name/email form (Task 7)
│       ├── Header.tsx              # title + "edit my info" (Task 7)
│       ├── PointForm.tsx           # class/year/floodable/confidence/notes (Task 8)
│       ├── SessionList.tsx         # own points, edit/delete, CSV download (Task 9)
│       ├── CoordinateInput.tsx     # lat/long paste box (Task 10)
│       ├── PlaceSearch.tsx         # Nominatim search box (Task 10)
│       └── MapPanel.tsx            # Leaflet map, basemaps, markers (Task 10)
├── supabase/
│   └── schema.sql                  # table, constraints, triggers, RLS (Task 12)
└── .github/workflows/deploy.yml    # build + deploy to Pages (Task 14)
```

Tests are colocated as `*.test.ts` / `*.test.tsx` beside the module they cover — Vitest's default convention and it keeps a module and its tests in one place.

**Why these boundaries:** everything in `src/lib/` is pure and framework-free, so it is trivially testable and holds in context on its own. `MapPanel` is the one component with unavoidable imperative Leaflet state, so it is kept as thin as possible and all its logic is pushed into `coordinates.ts` and `geocode.ts`.

---

## Testing note: Leaflet and jsdom

react-leaflet does not render meaningfully in jsdom — it needs real layout and a real canvas. **Do not attempt unit tests of `MapPanel`'s rendered output.** All map-adjacent logic that can be tested lives in `coordinates.ts` and `geocode.ts` and is tested there exhaustively. `MapPanel` is verified by running the app (Task 11 has an explicit manual verification step). This is a deliberate, stated limit, not an oversight — a reviewer should not flag missing `MapPanel` unit tests.

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`. Every later task depends on these.

- [ ] **Step 1: Initialize the package and install dependencies**

```bash
cd ~/LandcoverTruthing
npm init -y
npm install react react-dom leaflet react-leaflet @supabase/supabase-js
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  @types/leaflet vitest jsdom @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event
```

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block in `package.json` with:

```json
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

Keep the `dependencies` and `devDependencies` blocks npm just wrote.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

The `base` path is what makes GitHub Pages serve assets correctly from a project subpath. Getting it wrong produces a blank white page on deploy with 404s for every asset.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/LandcoverTruthing/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
})
```

- [ ] **Step 5: Write `src/testSetup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Landcover Truthing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/App.tsx` and `src/main.tsx` placeholders**

`src/App.tsx`:

```tsx
export default function App() {
  return <h1>Landcover Truthing</h1>
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Write the failing smoke test**

`src/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs and has jsdom available', () => {
    expect(typeof document).toBe('object')
    expect(localStorage).toBeDefined()
  })
})
```

- [ ] **Step 9: Run the test suite**

Run: `npm test`
Expected: PASS, 1 test. If jsdom or `localStorage` is undefined, the `environment: 'jsdom'` setting in `vite.config.ts` did not take effect — fix that before continuing.

- [ ] **Step 10: Write `src/vite-env.d.ts`**

Without this, `import.meta.env.VITE_SUPABASE_URL` is a type error in Task 13.

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 11: Write `.gitignore` and `.env.example`**

`.gitignore`:

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

`.env.example`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 12: Verify the dev server boots**

Run: `npm run dev`
Expected: server starts, and `http://localhost:5173/LandcoverTruthing/` shows the "Landcover Truthing" heading. Stop it with Ctrl-C. Note the base path is part of the local URL too.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project with Vitest harness"
```

---

## Task 2: Domain types and configuration

**Files:**
- Create: `src/types.ts`, `src/config.ts`, `src/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LANDCOVER_CLASSES: readonly LandcoverClass[]`, `FLOODABLE_OPTIONS`, `CONFIDENCE_OPTIONS`, `PLACEMENT_METHODS`
  - `YEAR_FLOOR: 2020`, `currentYear(): number`, `availableYears(): number[]`
  - `DEFAULT_MAP_VIEW: { lat: number; lng: number; zoom: number }`
  - `NOTES_MAX_LENGTH: 1000`
  - Types `LandcoverClass`, `Floodable`, `Confidence`, `PlacementMethod`, `ContributorInfo`, `PointDraft`, `StoredPoint`

- [ ] **Step 1: Write `src/types.ts`**

`PointDraft` is the in-progress form state — class and year are nullable because they have no default. `StoredPoint` is a submitted point and has every field resolved.

```ts
import type {
  CONFIDENCE_OPTIONS,
  FLOODABLE_OPTIONS,
  LANDCOVER_CLASSES,
  PLACEMENT_METHODS,
} from './config'

export type LandcoverClass = (typeof LANDCOVER_CLASSES)[number]
export type Floodable = (typeof FLOODABLE_OPTIONS)[number]['value']
export type Confidence = (typeof CONFIDENCE_OPTIONS)[number]['value']
export type PlacementMethod = (typeof PLACEMENT_METHODS)[number]

export interface ContributorInfo {
  name: string
  email: string
}

/** In-progress form state. `landcoverClass` and `year` are null until chosen. */
export interface PointDraft {
  latitude: number
  longitude: number
  landcoverClass: LandcoverClass | null
  classOther: string
  year: number | null
  floodable: Floodable
  confidence: Confidence
  notes: string
  placementMethod: PlacementMethod
  gpsAccuracyM: number | null
}

/** A submitted point, as held in local storage and in the database. */
export interface StoredPoint {
  id: string
  createdAt: string
  updatedAt: string
  sessionToken: string
  contributorName: string
  contributorEmail: string
  latitude: number
  longitude: number
  landcoverClass: LandcoverClass
  classOther: string | null
  year: number
  floodable: Floodable
  confidence: Confidence
  notes: string | null
  placementMethod: PlacementMethod
  gpsAccuracyM: number | null
}
```

- [ ] **Step 2: Write the failing config test**

`src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LANDCOVER_CLASSES,
  FLOODABLE_OPTIONS,
  CONFIDENCE_OPTIONS,
  YEAR_FLOOR,
  DEFAULT_MAP_VIEW,
  currentYear,
  availableYears,
} from './config'

describe('config', () => {
  it('lists the ten landcover classes in the agreed order', () => {
    expect(LANDCOVER_CLASSES).toEqual([
      'moist-soil',
      'corn/dirty',
      'rice/dirty',
      'other ag/dirty',
      'corn',
      'rice',
      'millet',
      'milo',
      'sunflowers',
      'other',
    ])
  })

  it('puts "other" last, since it is the free-text escape hatch', () => {
    expect(LANDCOVER_CLASSES[LANDCOVER_CLASSES.length - 1]).toBe('other')
  })

  it('has no duplicate class names', () => {
    expect(new Set(LANDCOVER_CLASSES).size).toBe(LANDCOVER_CLASSES.length)
  })

  it('offers the three floodable options with unknown available', () => {
    expect(FLOODABLE_OPTIONS.map((o) => o.value)).toEqual(['yes', 'no', 'unknown'])
  })

  it('offers the three confidence options', () => {
    expect(CONFIDENCE_OPTIONS.map((o) => o.value)).toEqual([
      'certain',
      'fairly_sure',
      'best_guess',
    ])
  })

  it('gives every option a human-readable label', () => {
    for (const option of [...FLOODABLE_OPTIONS, ...CONFIDENCE_OPTIONS]) {
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('sets the year floor at 2020', () => {
    expect(YEAR_FLOOR).toBe(2020)
  })

  it('derives the current year at runtime rather than hardcoding it', () => {
    expect(currentYear()).toBe(new Date().getFullYear())
  })

  it('lists years newest-first from the current year down to the floor', () => {
    const years = availableYears()
    expect(years[0]).toBe(currentYear())
    expect(years[years.length - 1]).toBe(YEAR_FLOOR)
    expect(years.length).toBe(currentYear() - YEAR_FLOOR + 1)
  })

  it('defaults the map to the Lower Mississippi Alluvial Valley', () => {
    expect(DEFAULT_MAP_VIEW).toEqual({ lat: 34.5, lng: -91.0, zoom: 7 })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- config`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 4: Write `src/config.ts`**

```ts
/**
 * Single source of truth for the app's fixed vocabularies and defaults.
 * Adding a landcover class means editing LANDCOVER_CLASSES here AND migrating
 * the landcover_class CHECK constraint in supabase/schema.sql.
 */

export const LANDCOVER_CLASSES = [
  'moist-soil',
  'corn/dirty',
  'rice/dirty',
  'other ag/dirty',
  'corn',
  'rice',
  'millet',
  'milo',
  'sunflowers',
  'other',
] as const

/** The only class that reveals a free-text box. */
export const OTHER_CLASS = 'other'

export const FLOODABLE_OPTIONS = [
  { value: 'yes', label: 'Yes — it can be flooded' },
  { value: 'no', label: 'No — it cannot be flooded' },
  { value: 'unknown', label: "Unknown — I'm not sure" },
] as const

export const CONFIDENCE_OPTIONS = [
  { value: 'certain', label: 'Certain' },
  { value: 'fairly_sure', label: 'Fairly sure' },
  { value: 'best_guess', label: 'Best guess' },
] as const

export const PLACEMENT_METHODS = [
  'map_click',
  'device_gps',
  'coordinates',
  'search',
] as const

export const YEAR_FLOOR = 2020

export const NOTES_MAX_LENGTH = 1000

export const DEFAULT_MAP_VIEW = { lat: 34.5, lng: -91.0, zoom: 7 }

export function currentYear(): number {
  return new Date().getFullYear()
}

/** Years newest-first, current year down to YEAR_FLOOR. */
export function availableYears(): number[] {
  const years: number[] = []
  for (let y = currentYear(); y >= YEAR_FLOOR; y--) years.push(y)
  return years
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- config`
Expected: PASS, 10 tests.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/config.ts src/config.test.ts
git commit -m "feat: add domain types and landcover configuration"
```

---

## Task 3: Coordinate parsing

**Files:**
- Create: `src/lib/coordinates.ts`, `src/lib/coordinates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCoordinates(input: string): { latitude: number; longitude: number } | null`
  - `formatCoordinates(lat: number, lng: number): string` — 6 decimal places, comma-separated
  - `isValidLatitude(n: number): boolean`, `isValidLongitude(n: number): boolean`

**Why this matters:** contributors paste coordinates from Google Maps, from a handheld GPS, and out of email. Those three sources produce three different formats. A parser that only handles decimal degrees will silently reject half of what people paste.

- [ ] **Step 1: Write the failing test**

`src/lib/coordinates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  formatCoordinates,
  isValidLatitude,
  isValidLongitude,
  parseCoordinates,
} from './coordinates'

describe('isValidLatitude / isValidLongitude', () => {
  it('accepts in-range values including the poles and antimeridian', () => {
    expect(isValidLatitude(0)).toBe(true)
    expect(isValidLatitude(90)).toBe(true)
    expect(isValidLatitude(-90)).toBe(true)
    expect(isValidLongitude(180)).toBe(true)
    expect(isValidLongitude(-180)).toBe(true)
  })

  it('rejects out-of-range values', () => {
    expect(isValidLatitude(90.001)).toBe(false)
    expect(isValidLatitude(-91)).toBe(false)
    expect(isValidLongitude(180.5)).toBe(false)
  })

  it('rejects NaN and Infinity', () => {
    expect(isValidLatitude(NaN)).toBe(false)
    expect(isValidLongitude(Infinity)).toBe(false)
  })
})

describe('parseCoordinates — decimal degrees', () => {
  it('parses a plain comma-separated pair', () => {
    expect(parseCoordinates('34.5, -91.0')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('parses a space-separated pair', () => {
    expect(parseCoordinates('34.5 -91.0')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('tolerates surrounding whitespace and stray tabs', () => {
    expect(parseCoordinates('  34.5 ,\t-91.0  ')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('parses integers without a decimal point', () => {
    expect(parseCoordinates('34, -91')).toEqual({ latitude: 34, longitude: -91 })
  })

  it('parses an explicit plus sign', () => {
    expect(parseCoordinates('+34.5, -91.0')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })
})

describe('parseCoordinates — hemisphere suffixes', () => {
  it('applies N/W suffixes to unsigned values', () => {
    expect(parseCoordinates('34.5N, 91.0W')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('applies S/E suffixes', () => {
    expect(parseCoordinates('34.5S, 91.0E')).toEqual({
      latitude: -34.5,
      longitude: 91.0,
    })
  })

  it('accepts lowercase hemisphere letters', () => {
    expect(parseCoordinates('34.5n 91.0w')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('accepts a hemisphere letter before the number', () => {
    expect(parseCoordinates('N34.5 W91.0')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })

  it('reorders when longitude is given first via hemisphere letters', () => {
    expect(parseCoordinates('91.0W, 34.5N')).toEqual({
      latitude: 34.5,
      longitude: -91.0,
    })
  })
})

describe('parseCoordinates — degrees/minutes/seconds', () => {
  it('parses full DMS with symbols', () => {
    const result = parseCoordinates(`34°30'00"N 91°00'00"W`)
    expect(result!.latitude).toBeCloseTo(34.5, 6)
    expect(result!.longitude).toBeCloseTo(-91.0, 6)
  })

  it('parses DMS with fractional seconds', () => {
    const result = parseCoordinates(`34°30'30.5"N 91°15'00"W`)
    expect(result!.latitude).toBeCloseTo(34.508472, 5)
    expect(result!.longitude).toBeCloseTo(-91.25, 6)
  })

  it('parses degrees and decimal minutes (the handheld GPS format)', () => {
    const result = parseCoordinates(`34°30.5'N 91°15.0'W`)
    expect(result!.latitude).toBeCloseTo(34.508333, 5)
    expect(result!.longitude).toBeCloseTo(-91.25, 6)
  })

  it('parses space-separated DMS without symbols', () => {
    const result = parseCoordinates('34 30 00 N, 91 00 00 W')
    expect(result!.latitude).toBeCloseTo(34.5, 6)
    expect(result!.longitude).toBeCloseTo(-91.0, 6)
  })
})

describe('parseCoordinates — rejection', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('   ')).toBeNull()
  })

  it('rejects a single number', () => {
    expect(parseCoordinates('34.5')).toBeNull()
  })

  it('rejects non-numeric text', () => {
    expect(parseCoordinates('somewhere in Arkansas')).toBeNull()
  })

  it('rejects out-of-range latitude', () => {
    expect(parseCoordinates('95.0, -91.0')).toBeNull()
  })

  it('rejects out-of-range longitude', () => {
    expect(parseCoordinates('34.5, -195.0')).toBeNull()
  })

  it('rejects contradictory hemispheres on the same value', () => {
    expect(parseCoordinates('34.5NS, 91.0W')).toBeNull()
  })

  it('rejects more than two coordinate components', () => {
    expect(parseCoordinates('34.5, -91.0, 12.0')).toBeNull()
  })
})

describe('formatCoordinates', () => {
  it('formats to six decimal places', () => {
    expect(formatCoordinates(34.5, -91)).toBe('34.500000, -91.000000')
  })

  it('rounds rather than truncating', () => {
    expect(formatCoordinates(34.1234567, -91.7654321)).toBe('34.123457, -91.765432')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- coordinates`
Expected: FAIL — cannot resolve `./coordinates`.

- [ ] **Step 3: Write `src/lib/coordinates.ts`**

```ts
/**
 * Parses the coordinate formats people actually paste: decimal degrees from
 * Google Maps, degrees/decimal-minutes from handheld GPS units, and full DMS
 * from older sources. Returns null rather than throwing — the caller is a text
 * input that re-parses on every keystroke.
 */

export function isValidLatitude(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90
}

export function isValidLongitude(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

interface Component {
  value: number
  hemisphere: 'N' | 'S' | 'E' | 'W' | null
}

/**
 * One coordinate component: an optional leading hemisphere letter, one to three
 * numbers (degrees, minutes, seconds), and an optional trailing hemisphere letter.
 */
const COMPONENT = new RegExp(
  [
    '^',
    '([NSEW])?', // leading hemisphere
    '\\s*',
    '([+-]?\\d+(?:\\.\\d+)?)', // degrees
    '\\s*[°d]?\\s*',
    "(?:(\\d+(?:\\.\\d+)?)\\s*['m]?\\s*)?", // minutes
    '(?:(\\d+(?:\\.\\d+)?)\\s*["s]?\\s*)?', // seconds
    '([NSEW])?', // trailing hemisphere
    '$',
  ].join(''),
  'i',
)

function parseComponent(raw: string): Component | null {
  const text = raw.trim()
  if (!text) return null

  const match = COMPONENT.exec(text)
  if (!match) return null

  const [, lead, degStr, minStr, secStr, trail] = match

  // A hemisphere on both sides is contradictory input, not a coordinate.
  if (lead && trail) return null
  const hemisphere = ((lead ?? trail)?.toUpperCase() ?? null) as Component['hemisphere']

  const degrees = Number(degStr)
  if (!Number.isFinite(degrees)) return null

  const minutes = minStr === undefined ? 0 : Number(minStr)
  const seconds = secStr === undefined ? 0 : Number(secStr)
  if (minutes >= 60 || seconds >= 60) return null

  // A hemisphere letter carries the sign, so a signed degree alongside one is
  // ambiguous; reject rather than guess.
  if (hemisphere && /^[+-]/.test(degStr)) return null

  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600
  let value = degrees < 0 ? -magnitude : magnitude
  if (hemisphere === 'S' || hemisphere === 'W') value = -value

  return { value, hemisphere }
}

/** Splits on comma, or on whitespace when there is no comma. */
function splitComponents(input: string): string[] {
  const trimmed = input.trim()
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((part) => part.trim()).filter(Boolean)
  }
  // Without a comma, the split point is the whitespace before the second
  // hemisphere letter or the second sign — fall back to halving on the widest
  // run of whitespace.
  const parts = trimmed.split(/\s{2,}/).filter(Boolean)
  if (parts.length === 2) return parts
  return splitOnHemisphereOrSign(trimmed)
}

function splitOnHemisphereOrSign(text: string): string[] {
  // Split after a hemisphere letter that is followed by more content.
  const afterHemisphere = /([NSEW])\s+(?=\S)/i.exec(text)
  if (afterHemisphere && afterHemisphere.index > 0) {
    const cut = afterHemisphere.index + 1
    return [text.slice(0, cut).trim(), text.slice(cut).trim()]
  }
  // Split before a leading hemisphere letter of the second component.
  const beforeHemisphere = /\s+(?=[NSEW]\s*[\d+-])/i.exec(text)
  if (beforeHemisphere) {
    return [
      text.slice(0, beforeHemisphere.index).trim(),
      text.slice(beforeHemisphere.index).trim(),
    ]
  }
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 2) return tokens
  // Space-separated DMS: six tokens plus up to two hemisphere letters.
  if (tokens.length % 2 === 0) {
    const half = tokens.length / 2
    return [tokens.slice(0, half).join(' '), tokens.slice(half).join(' ')]
  }
  return tokens
}

export function parseCoordinates(
  input: string,
): { latitude: number; longitude: number } | null {
  if (!input || !input.trim()) return null

  const rawParts = splitComponents(input)
  if (rawParts.length !== 2) return null

  const first = parseComponent(rawParts[0])
  const second = parseComponent(rawParts[1])
  if (!first || !second) return null

  // Hemisphere letters name the axis explicitly; otherwise assume lat, lng order.
  let latComponent = first
  let lngComponent = second
  const firstIsLongitude = first.hemisphere === 'E' || first.hemisphere === 'W'
  const secondIsLatitude = second.hemisphere === 'N' || second.hemisphere === 'S'
  if (firstIsLongitude || secondIsLatitude) {
    latComponent = second
    lngComponent = first
  }

  const latitude = latComponent.value
  const longitude = lngComponent.value
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null

  return { latitude, longitude }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- coordinates`
Expected: PASS, all tests. If a DMS case fails, the likely cause is the split heuristic — debug by logging `splitComponents` output for that input before changing the regex.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coordinates.ts src/lib/coordinates.test.ts
git commit -m "feat: parse decimal-degree, DMS, and degrees-decimal-minutes coordinates"
```

---

## Task 4: Row mapping and CSV generation

**Files:**
- Create: `src/lib/mapping.ts`, `src/lib/mapping.test.ts`, `src/lib/csv.ts`, `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `StoredPoint` (Task 2).
- Produces:
  - `toRow(point: StoredPoint): Record<string, unknown>` — camelCase → snake_case
  - `fromRow(row: Record<string, unknown>): StoredPoint` — snake_case → camelCase
  - `CSV_COLUMNS: readonly string[]` — snake_case headers, excludes `session_token`
  - `toCsv(points: StoredPoint[]): string`
  - `downloadCsv(filename: string, csv: string): void`

**Why `session_token` is excluded:** it is a bearer secret. See Global Constraints.

- [ ] **Step 1: Write the failing mapping test**

`src/lib/mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StoredPoint } from '../types'
import { fromRow, toRow } from './mapping'

const point: StoredPoint = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-07-31T12:00:00.000Z',
  updatedAt: '2026-07-31T12:00:00.000Z',
  sessionToken: '22222222-2222-4222-8222-222222222222',
  contributorName: 'Ryan Askren',
  contributorEmail: 'ryanaskren@gmail.com',
  latitude: 34.5,
  longitude: -91.0,
  landcoverClass: 'rice/dirty',
  classOther: null,
  year: 2023,
  floodable: 'yes',
  confidence: 'certain',
  notes: 'East half only.',
  placementMethod: 'map_click',
  gpsAccuracyM: null,
}

describe('toRow', () => {
  it('converts every property to its snake_case column name', () => {
    expect(toRow(point)).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      created_at: '2026-07-31T12:00:00.000Z',
      updated_at: '2026-07-31T12:00:00.000Z',
      session_token: '22222222-2222-4222-8222-222222222222',
      contributor_name: 'Ryan Askren',
      contributor_email: 'ryanaskren@gmail.com',
      latitude: 34.5,
      longitude: -91.0,
      landcover_class: 'rice/dirty',
      class_other: null,
      year: 2023,
      floodable: 'yes',
      confidence: 'certain',
      notes: 'East half only.',
      placement_method: 'map_click',
      gps_accuracy_m: null,
    })
  })
})

describe('fromRow', () => {
  it('round-trips a point through toRow and back unchanged', () => {
    expect(fromRow(toRow(point))).toEqual(point)
  })

  it('coerces numeric columns arriving as strings from PostgREST', () => {
    const row = { ...toRow(point), latitude: '34.5', longitude: '-91.0', year: '2023' }
    const result = fromRow(row)
    expect(result.latitude).toBe(34.5)
    expect(result.longitude).toBe(-91.0)
    expect(result.year).toBe(2023)
  })

  it('preserves null for optional columns', () => {
    const result = fromRow({ ...toRow(point), notes: null, gps_accuracy_m: null })
    expect(result.notes).toBeNull()
    expect(result.gpsAccuracyM).toBeNull()
  })

  it('preserves a gps accuracy value when present', () => {
    const result = fromRow({ ...toRow(point), gps_accuracy_m: 4.7 })
    expect(result.gpsAccuracyM).toBe(4.7)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- mapping`
Expected: FAIL — cannot resolve `./mapping`.

- [ ] **Step 3: Write `src/lib/mapping.ts`**

```ts
import type { StoredPoint } from '../types'

/**
 * The single boundary between camelCase TypeScript and snake_case Postgres.
 * Nothing else in the app should know both spellings.
 */

export function toRow(point: StoredPoint): Record<string, unknown> {
  return {
    id: point.id,
    created_at: point.createdAt,
    updated_at: point.updatedAt,
    session_token: point.sessionToken,
    contributor_name: point.contributorName,
    contributor_email: point.contributorEmail,
    latitude: point.latitude,
    longitude: point.longitude,
    landcover_class: point.landcoverClass,
    class_other: point.classOther,
    year: point.year,
    floodable: point.floodable,
    confidence: point.confidence,
    notes: point.notes,
    placement_method: point.placementMethod,
    gps_accuracy_m: point.gpsAccuracyM,
  }
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value)
}

export function fromRow(row: Record<string, unknown>): StoredPoint {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sessionToken: String(row.session_token),
    contributorName: String(row.contributor_name),
    contributorEmail: String(row.contributor_email),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    landcoverClass: row.landcover_class as StoredPoint['landcoverClass'],
    classOther: (row.class_other ?? null) as string | null,
    year: num(row.year),
    floodable: row.floodable as StoredPoint['floodable'],
    confidence: row.confidence as StoredPoint['confidence'],
    notes: (row.notes ?? null) as string | null,
    placementMethod: row.placement_method as StoredPoint['placementMethod'],
    gpsAccuracyM: nullableNum(row.gps_accuracy_m),
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- mapping`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing CSV test**

`src/lib/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StoredPoint } from '../types'
import { CSV_COLUMNS, toCsv } from './csv'

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'id-1',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: 'secret-token',
    contributorName: 'Ryan Askren',
    contributorEmail: 'ryanaskren@gmail.com',
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: null,
    year: 2023,
    floodable: 'yes',
    confidence: 'certain',
    notes: null,
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

describe('CSV_COLUMNS', () => {
  it('excludes session_token, which is a bearer secret', () => {
    expect(CSV_COLUMNS).not.toContain('session_token')
  })

  it('uses snake_case column names matching the database', () => {
    expect(CSV_COLUMNS).toContain('landcover_class')
    expect(CSV_COLUMNS).toContain('gps_accuracy_m')
    expect(CSV_COLUMNS).toContain('placement_method')
  })
})

describe('toCsv', () => {
  it('emits a header row even with no points', () => {
    expect(toCsv([])).toBe(CSV_COLUMNS.join(','))
  })

  it('writes one row per point', () => {
    const csv = toCsv([makePoint({ id: 'a' }), makePoint({ id: 'b' })])
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('uses CRLF line endings per RFC 4180', () => {
    expect(toCsv([makePoint()])).toContain('\r\n')
  })

  it('never leaks the session token into the output', () => {
    expect(toCsv([makePoint()])).not.toContain('secret-token')
  })

  it('renders null as an empty field rather than the text "null"', () => {
    const csv = toCsv([makePoint({ notes: null, classOther: null })])
    expect(csv).not.toContain('null')
  })

  it('quotes fields containing a comma', () => {
    const csv = toCsv([makePoint({ notes: 'east half, not west' })])
    expect(csv).toContain('"east half, not west"')
  })

  it('doubles embedded quotes and wraps the field', () => {
    const csv = toCsv([makePoint({ notes: 'he called it "the pond"' })])
    expect(csv).toContain('"he called it ""the pond"""')
  })

  it('quotes fields containing a newline', () => {
    const csv = toCsv([makePoint({ notes: 'line one\nline two' })])
    expect(csv).toContain('"line one\nline two"')
  })

  it('does not quote ordinary fields', () => {
    expect(toCsv([makePoint({ notes: 'plain text' })])).toContain(',plain text,')
  })

  it('writes the free-text class for an "other" point', () => {
    const csv = toCsv([
      makePoint({ landcoverClass: 'other', classOther: 'buckwheat' }),
    ])
    expect(csv).toContain('other')
    expect(csv).toContain('buckwheat')
  })

  it('writes full coordinate precision without scientific notation', () => {
    const csv = toCsv([makePoint({ latitude: 34.1234567, longitude: -91.7654321 })])
    expect(csv).toContain('34.1234567')
    expect(csv).toContain('-91.7654321')
  })

  it('preserves a class name containing a slash without quoting it', () => {
    expect(toCsv([makePoint({ landcoverClass: 'rice/dirty' })])).toContain('rice/dirty')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- csv`
Expected: FAIL — cannot resolve `./csv`.

- [ ] **Step 7: Write `src/lib/csv.ts`**

```ts
import type { StoredPoint } from '../types'
import { toRow } from './mapping'

/**
 * RFC 4180 CSV. Notes are free text and will contain commas, quotes, and
 * newlines, so escaping is the whole job here.
 *
 * session_token is deliberately omitted: it is a bearer secret and this file
 * gets emailed around. The owner's Supabase dashboard export still includes it.
 */

export const CSV_COLUMNS = [
  'id',
  'created_at',
  'updated_at',
  'contributor_name',
  'contributor_email',
  'latitude',
  'longitude',
  'landcover_class',
  'class_other',
  'year',
  'floodable',
  'confidence',
  'notes',
  'placement_method',
  'gps_accuracy_m',
] as const

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(points: StoredPoint[]): string {
  const header = CSV_COLUMNS.join(',')
  const rows = points.map((point) => {
    const row = toRow(point)
    return CSV_COLUMNS.map((column) => escapeField(row[column])).join(',')
  })
  return [header, ...rows].join('\r\n')
}

/** Triggers a browser download. Not unit-tested — it is pure DOM plumbing. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel open UTF-8 correctly instead of mangling accents.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -- csv`
Expected: PASS, 14 tests.

- [ ] **Step 9: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/mapping.ts src/lib/mapping.test.ts src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: add row mapping and RFC 4180 CSV export"
```

---

## Task 5: Draft validation

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: `PointDraft`, `ContributorInfo` (Task 2), config constants (Task 2).
- Produces:
  - `validateDraft(draft: PointDraft): ValidationResult`
  - `validateContributor(info: ContributorInfo): ValidationResult`
  - `ValidationResult = { valid: boolean; errors: Record<string, string> }`
  - `firstError(result: ValidationResult): string | null` — the submit button's tooltip

**Design note:** errors are keyed by field name so the form can render each message beside its input, and `firstError` gives the submit button a single reason to display. The spec requires the blocking reason be shown, not left to guess.

- [ ] **Step 1: Write the failing test**

`src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ContributorInfo, PointDraft } from '../types'
import { currentYear } from '../config'
import { firstError, validateContributor, validateDraft } from './validation'

function makeDraft(overrides: Partial<PointDraft> = {}): PointDraft {
  return {
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: '',
    year: 2023,
    floodable: 'unknown',
    confidence: 'certain',
    notes: '',
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

function makeContributor(overrides: Partial<ContributorInfo> = {}): ContributorInfo {
  return { name: 'Ryan Askren', email: 'ryanaskren@gmail.com', ...overrides }
}

describe('validateDraft — happy path', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(makeDraft()).valid).toBe(true)
  })

  it('accepts an "other" draft with free text supplied', () => {
    const draft = makeDraft({ landcoverClass: 'other', classOther: 'buckwheat' })
    expect(validateDraft(draft).valid).toBe(true)
  })

  it('accepts every year from the floor to the current year', () => {
    for (const year of [2020, 2022, currentYear()]) {
      expect(validateDraft(makeDraft({ year })).valid).toBe(true)
    }
  })
})

describe('validateDraft — class', () => {
  it('rejects a missing class', () => {
    const result = validateDraft(makeDraft({ landcoverClass: null }))
    expect(result.valid).toBe(false)
    expect(result.errors.landcoverClass).toMatch(/class/i)
  })

  it('requires free text when the class is "other"', () => {
    const result = validateDraft(makeDraft({ landcoverClass: 'other', classOther: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.classOther).toBeTruthy()
  })

  it('rejects whitespace-only free text for "other"', () => {
    const result = validateDraft(
      makeDraft({ landcoverClass: 'other', classOther: '   ' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.classOther).toBeTruthy()
  })

  it('ignores stray free text when the class is not "other"', () => {
    const draft = makeDraft({ landcoverClass: 'rice', classOther: 'leftover text' })
    expect(validateDraft(draft).valid).toBe(true)
  })
})

describe('validateDraft — year', () => {
  it('rejects a missing year', () => {
    const result = validateDraft(makeDraft({ year: null }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toMatch(/year/i)
  })

  it('rejects a year before the 2020 floor', () => {
    const result = validateDraft(makeDraft({ year: 2019 }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toContain('2020')
  })

  it('rejects a year in the future', () => {
    const result = validateDraft(makeDraft({ year: currentYear() + 1 }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toBeTruthy()
  })
})

describe('validateDraft — location', () => {
  it('rejects an out-of-range latitude', () => {
    const result = validateDraft(makeDraft({ latitude: 95 }))
    expect(result.valid).toBe(false)
    expect(result.errors.location).toBeTruthy()
  })

  it('rejects an out-of-range longitude', () => {
    expect(validateDraft(makeDraft({ longitude: 200 })).valid).toBe(false)
  })

  it('rejects NaN coordinates', () => {
    expect(validateDraft(makeDraft({ latitude: NaN })).valid).toBe(false)
  })

  it('accepts coordinates anywhere on earth, since there is no study-area limit', () => {
    expect(validateDraft(makeDraft({ latitude: -33.9, longitude: 151.2 })).valid).toBe(
      true,
    )
  })
})

describe('validateDraft — notes', () => {
  it('accepts empty notes', () => {
    expect(validateDraft(makeDraft({ notes: '' })).valid).toBe(true)
  })

  it('rejects notes longer than 1000 characters', () => {
    const result = validateDraft(makeDraft({ notes: 'x'.repeat(1001) }))
    expect(result.valid).toBe(false)
    expect(result.errors.notes).toBeTruthy()
  })

  it('accepts notes of exactly 1000 characters', () => {
    expect(validateDraft(makeDraft({ notes: 'x'.repeat(1000) })).valid).toBe(true)
  })
})

describe('validateDraft — enumerations', () => {
  it('rejects a floodable value outside the allowed set', () => {
    const draft = makeDraft({ floodable: 'maybe' as never })
    expect(validateDraft(draft).valid).toBe(false)
  })

  it('rejects a confidence value outside the allowed set', () => {
    const draft = makeDraft({ confidence: 'sure' as never })
    expect(validateDraft(draft).valid).toBe(false)
  })
})

describe('firstError', () => {
  it('returns null for a valid draft', () => {
    expect(firstError(validateDraft(makeDraft()))).toBeNull()
  })

  it('returns a human-readable reason for an invalid draft', () => {
    const message = firstError(validateDraft(makeDraft({ landcoverClass: null })))
    expect(message).toMatch(/class/i)
  })
})

describe('validateContributor', () => {
  it('accepts a name and email', () => {
    expect(validateContributor(makeContributor()).valid).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = validateContributor(makeContributor({ name: '  ' }))
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeTruthy()
  })

  it('rejects an empty email', () => {
    expect(validateContributor(makeContributor({ email: '' })).valid).toBe(false)
  })

  it('rejects an email with no @ sign', () => {
    const result = validateContributor(makeContributor({ email: 'not-an-email' }))
    expect(result.valid).toBe(false)
    expect(result.errors.email).toBeTruthy()
  })

  it('rejects an email with no domain dot', () => {
    expect(validateContributor(makeContributor({ email: 'a@b' })).valid).toBe(false)
  })

  it('accepts an email with a plus tag', () => {
    const info = makeContributor({ email: 'ryan+ducks@example.com' })
    expect(validateContributor(info).valid).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- validation`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 3: Write `src/lib/validation.ts`**

```ts
import {
  CONFIDENCE_OPTIONS,
  FLOODABLE_OPTIONS,
  LANDCOVER_CLASSES,
  NOTES_MAX_LENGTH,
  OTHER_CLASS,
  YEAR_FLOOR,
  currentYear,
} from '../config'
import type { ContributorInfo, PointDraft } from '../types'
import { isValidLatitude, isValidLongitude } from './coordinates'

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

/** Field order determines which message the submit button shows. */
const DRAFT_FIELD_ORDER = [
  'location',
  'landcoverClass',
  'classOther',
  'year',
  'floodable',
  'confidence',
  'notes',
]

export function validateDraft(draft: PointDraft): ValidationResult {
  const errors: Record<string, string> = {}

  if (!isValidLatitude(draft.latitude) || !isValidLongitude(draft.longitude)) {
    errors.location = 'Place a point on the map first.'
  }

  if (!draft.landcoverClass) {
    errors.landcoverClass = 'Choose a landcover class.'
  } else if (!LANDCOVER_CLASSES.includes(draft.landcoverClass)) {
    errors.landcoverClass = 'That landcover class is not recognized.'
  } else if (draft.landcoverClass === OTHER_CLASS && !draft.classOther.trim()) {
    errors.classOther = 'Describe the landcover, since you chose "other".'
  }

  if (draft.year === null) {
    errors.year = 'Choose the year.'
  } else if (!Number.isInteger(draft.year)) {
    errors.year = 'The year must be a whole number.'
  } else if (draft.year < YEAR_FLOOR) {
    errors.year = `We only collect ${YEAR_FLOOR} and later.`
  } else if (draft.year > currentYear()) {
    errors.year = 'The year cannot be in the future.'
  }

  if (!FLOODABLE_OPTIONS.some((option) => option.value === draft.floodable)) {
    errors.floodable = 'Choose whether this ground can be flooded.'
  }

  if (!CONFIDENCE_OPTIONS.some((option) => option.value === draft.confidence)) {
    errors.confidence = 'Choose how confident you are.'
  }

  if (draft.notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function firstError(result: ValidationResult): string | null {
  for (const field of DRAFT_FIELD_ORDER) {
    if (result.errors[field]) return result.errors[field]
  }
  const remaining = Object.values(result.errors)
  return remaining.length > 0 ? remaining[0] : null
}

/** Deliberately permissive: catches typos, does not police valid addresses. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateContributor(info: ContributorInfo): ValidationResult {
  const errors: Record<string, string> = {}

  if (!info.name.trim()) {
    errors.name = 'Enter your name.'
  }

  if (!info.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!EMAIL_SHAPE.test(info.email.trim())) {
    errors.email = "That does not look like an email address."
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- validation`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add draft and contributor validation"
```

---

## Task 6: Local storage persistence

**Files:**
- Create: `src/lib/storage.ts`, `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `ContributorInfo`, `StoredPoint` (Task 2).
- Produces:
  - `getSessionToken(): string` — reads or lazily creates a stable per-browser UUID
  - `loadContributor(): ContributorInfo | null`, `saveContributor(info): void`
  - `loadPoints(): StoredPoint[]`, `savePoints(points): void`
  - `addPoint(point): StoredPoint[]`, `updatePoint(point): StoredPoint[]`, `removePoint(id): StoredPoint[]`
  - `newId(): string`

**Design note:** every mutator returns the resulting array so `App` can set state from the return value rather than re-reading storage. Corrupt or hand-edited storage must never crash the app — a bad JSON blob is treated as empty.

- [ ] **Step 1: Write the failing test**

`src/lib/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredPoint } from '../types'
import {
  addPoint,
  getSessionToken,
  loadContributor,
  loadPoints,
  newId,
  removePoint,
  saveContributor,
  savePoints,
  updatePoint,
} from './storage'

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: newId(),
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: getSessionToken(),
    contributorName: 'Ryan Askren',
    contributorEmail: 'ryanaskren@gmail.com',
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: null,
    year: 2023,
    floodable: 'yes',
    confidence: 'certain',
    notes: null,
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('getSessionToken', () => {
  it('creates a token on first call', () => {
    expect(getSessionToken()).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('returns the same token on subsequent calls', () => {
    expect(getSessionToken()).toBe(getSessionToken())
  })

  it('survives a reload by persisting to local storage', () => {
    const token = getSessionToken()
    expect(localStorage.getItem('lct.sessionToken')).toBe(token)
  })
})

describe('newId', () => {
  it('generates unique ids', () => {
    expect(newId()).not.toBe(newId())
  })
})

describe('contributor persistence', () => {
  it('returns null before anything is saved', () => {
    expect(loadContributor()).toBeNull()
  })

  it('round-trips a contributor', () => {
    saveContributor({ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' })
    expect(loadContributor()).toEqual({
      name: 'Ryan Askren',
      email: 'ryanaskren@gmail.com',
    })
  })

  it('overwrites on a second save, so "edit my info" works', () => {
    saveContributor({ name: 'First', email: 'first@example.com' })
    saveContributor({ name: 'Second', email: 'second@example.com' })
    expect(loadContributor()?.name).toBe('Second')
  })

  it('treats corrupt stored JSON as absent rather than crashing', () => {
    localStorage.setItem('lct.contributor', 'not json{{{')
    expect(loadContributor()).toBeNull()
  })

  it('treats a stored value missing required fields as absent', () => {
    localStorage.setItem('lct.contributor', JSON.stringify({ name: 'No email' }))
    expect(loadContributor()).toBeNull()
  })
})

describe('point persistence', () => {
  it('starts empty', () => {
    expect(loadPoints()).toEqual([])
  })

  it('round-trips saved points', () => {
    const point = makePoint()
    savePoints([point])
    expect(loadPoints()).toEqual([point])
  })

  it('treats corrupt stored JSON as an empty list', () => {
    localStorage.setItem('lct.points', '{{{not json')
    expect(loadPoints()).toEqual([])
  })

  it('treats a stored non-array as an empty list', () => {
    localStorage.setItem('lct.points', JSON.stringify({ nope: true }))
    expect(loadPoints()).toEqual([])
  })
})

describe('addPoint', () => {
  it('puts the newest point first, matching the session list order', () => {
    const older = makePoint({ id: 'older' })
    const newer = makePoint({ id: 'newer' })
    addPoint(older)
    const result = addPoint(newer)
    expect(result.map((p) => p.id)).toEqual(['newer', 'older'])
  })

  it('persists across a reload', () => {
    addPoint(makePoint({ id: 'kept' }))
    expect(loadPoints().map((p) => p.id)).toEqual(['kept'])
  })
})

describe('updatePoint', () => {
  it('replaces the matching point and leaves others alone', () => {
    addPoint(makePoint({ id: 'a', year: 2021 }))
    addPoint(makePoint({ id: 'b', year: 2022 }))
    const result = updatePoint(makePoint({ id: 'a', year: 2024 }))
    expect(result.find((p) => p.id === 'a')?.year).toBe(2024)
    expect(result.find((p) => p.id === 'b')?.year).toBe(2022)
  })

  it('preserves list order when updating', () => {
    addPoint(makePoint({ id: 'a' }))
    addPoint(makePoint({ id: 'b' }))
    const result = updatePoint(makePoint({ id: 'a', notes: 'edited' }))
    expect(result.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('leaves the list unchanged when the id is unknown', () => {
    addPoint(makePoint({ id: 'a' }))
    expect(updatePoint(makePoint({ id: 'ghost' }))).toHaveLength(1)
  })
})

describe('removePoint', () => {
  it('removes the matching point', () => {
    addPoint(makePoint({ id: 'a' }))
    addPoint(makePoint({ id: 'b' }))
    expect(removePoint('a').map((p) => p.id)).toEqual(['b'])
  })

  it('persists the removal', () => {
    addPoint(makePoint({ id: 'a' }))
    removePoint('a')
    expect(loadPoints()).toEqual([])
  })

  it('is a no-op for an unknown id', () => {
    addPoint(makePoint({ id: 'a' }))
    expect(removePoint('ghost')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- storage`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Write `src/lib/storage.ts`**

```ts
import type { ContributorInfo, StoredPoint } from '../types'

/**
 * Browser-local persistence. This is the contributor's copy of their own work
 * and the source for their CSV download; the database is the durable record.
 *
 * Every read is defensive: storage can be hand-edited, quota-exceeded, or
 * left over from an older version of the app, and none of that may crash it.
 */

const SESSION_TOKEN_KEY = 'lct.sessionToken'
const CONTRIBUTOR_KEY = 'lct.contributor'
const POINTS_KEY = 'lct.points'

export function newId(): string {
  return crypto.randomUUID()
}

/** Stable per-browser identifier; also the RLS key for edit and delete. */
export function getSessionToken(): string {
  const existing = localStorage.getItem(SESSION_TOKEN_KEY)
  if (existing) return existing
  const token = crypto.randomUUID()
  localStorage.setItem(SESSION_TOKEN_KEY, token)
  return token
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled. The database still has the data;
    // losing the local mirror is degraded, not fatal.
  }
}

export function loadContributor(): ContributorInfo | null {
  const stored = readJson<Partial<ContributorInfo>>(CONTRIBUTOR_KEY)
  if (!stored || typeof stored.name !== 'string' || typeof stored.email !== 'string') {
    return null
  }
  return { name: stored.name, email: stored.email }
}

export function saveContributor(info: ContributorInfo): void {
  writeJson(CONTRIBUTOR_KEY, info)
}

export function loadPoints(): StoredPoint[] {
  const stored = readJson<StoredPoint[]>(POINTS_KEY)
  return Array.isArray(stored) ? stored : []
}

export function savePoints(points: StoredPoint[]): void {
  writeJson(POINTS_KEY, points)
}

/** Newest first, matching how the session list renders. */
export function addPoint(point: StoredPoint): StoredPoint[] {
  const points = [point, ...loadPoints()]
  savePoints(points)
  return points
}

export function updatePoint(point: StoredPoint): StoredPoint[] {
  const points = loadPoints().map((existing) =>
    existing.id === point.id ? point : existing,
  )
  savePoints(points)
  return points
}

export function removePoint(id: string): StoredPoint[] {
  const points = loadPoints().filter((existing) => existing.id !== id)
  savePoints(points)
  return points
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- storage`
Expected: PASS, 21 tests. If `crypto.randomUUID` is undefined, the Node version is below 19 — check `node --version` (this project targets Node 26).

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: add local storage persistence for session, contributor, and points"
```

---

## Task 7: Identity gate and header

**Files:**
- Create: `src/components/IdentityGate.tsx`, `src/components/IdentityGate.test.tsx`, `src/components/Header.tsx`

**Interfaces:**
- Consumes: `validateContributor` (Task 5), `ContributorInfo` (Task 2).
- Produces:
  - `<IdentityGate initial={ContributorInfo | null} onSave={(info: ContributorInfo) => void} onCancel={() => void | undefined} />`
  - `<Header contributor={ContributorInfo} onEdit={() => void} />`

**Behavior:** shown full-screen on first visit with the project explanation, and reused as an editing form when the contributor clicks "edit my info" in the header. When `onCancel` is provided, a Cancel button renders — that is how the two modes differ.

- [ ] **Step 1: Write the failing test**

`src/components/IdentityGate.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import IdentityGate from './IdentityGate'

describe('IdentityGate', () => {
  it('explains what the project is asking for', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/landcover/i)).toBeInTheDocument()
  })

  it('renders empty name and email fields on first visit', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/name/i)).toHaveValue('')
    expect(screen.getByLabelText(/email/i)).toHaveValue('')
  })

  it('prefills the fields when editing existing info', () => {
    render(
      <IdentityGate
        initial={{ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' }}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/name/i)).toHaveValue('Ryan Askren')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ryanaskren@gmail.com')
  })

  it('calls onSave with trimmed values', async () => {
    const onSave = vi.fn()
    render(<IdentityGate initial={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(/name/i), '  Ryan Askren  ')
    await userEvent.type(screen.getByLabelText(/email/i), ' ryanaskren@gmail.com ')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Ryan Askren',
      email: 'ryanaskren@gmail.com',
    })
  })

  it('does not call onSave when the name is missing', async () => {
    const onSave = vi.fn()
    render(<IdentityGate initial={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'ryanaskren@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows a validation message for a malformed email', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(screen.getByText(/does not look like an email/i)).toBeInTheDocument()
  })

  it('clears the error once the input is corrected', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(screen.getByText(/does not look like an email/i)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/email/i))
    await userEvent.type(screen.getByLabelText(/email/i), 'ryan@example.com')
    expect(screen.queryByText(/does not look like an email/i)).not.toBeInTheDocument()
  })

  it('tells the contributor their email is not published', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByText(/not.*(shared|published|public)/i)).toBeInTheDocument()
  })

  it('shows no Cancel button on first visit', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('shows a Cancel button when editing, and calls onCancel', async () => {
    const onCancel = vi.fn()
    render(
      <IdentityGate
        initial={{ name: 'Ryan', email: 'ryan@example.com' }}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- IdentityGate`
Expected: FAIL — cannot resolve `./IdentityGate`.

- [ ] **Step 3: Write `src/components/IdentityGate.tsx`**

```tsx
import { useState } from 'react'
import type { ContributorInfo } from '../types'
import { validateContributor } from '../lib/validation'

interface Props {
  initial: ContributorInfo | null
  onSave: (info: ContributorInfo) => void
  /** Supplied only when editing existing info; its presence renders Cancel. */
  onCancel?: () => void
}

export default function IdentityGate({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = onCancel !== undefined

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const info = { name: name.trim(), email: email.trim() }
    const result = validateContributor(info)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSave(info)
  }

  return (
    <div className="identity-gate">
      <form className="identity-card" onSubmit={handleSubmit}>
        <h1>Landcover Truthing</h1>
        <p>
          Help build a training dataset for mapping waterfowl habitat. Drop a pin on a
          field you know, tell us what was planted there and in what year, and submit.
          Only fields you personally know about — no guessing from imagery.
        </p>
        <p className="identity-privacy">
          Your name and email are stored with each point so we can follow up on
          questions. They are not shared or published.
        </p>

        <label htmlFor="contributor-name">Your name</label>
        <input
          id="contributor-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setErrors((prev) => ({ ...prev, name: '' }))
          }}
        />
        {errors.name ? <p className="field-error">{errors.name}</p> : null}

        <label htmlFor="contributor-email">Your email</label>
        <input
          id="contributor-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setErrors((prev) => ({ ...prev, email: '' }))
          }}
        />
        {errors.email ? <p className="field-error">{errors.email}</p> : null}

        <div className="identity-actions">
          <button type="submit">{isEditing ? 'Save' : 'Start mapping'}</button>
          {isEditing ? (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- IdentityGate`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write `src/components/Header.tsx`**

No test — it is three elements with one callback, fully covered by the App integration test in Task 11.

```tsx
import type { ContributorInfo } from '../types'

interface Props {
  contributor: ContributorInfo
  onEdit: () => void
}

export default function Header({ contributor, onEdit }: Props) {
  return (
    <header className="app-header">
      <h1>Landcover Truthing</h1>
      <div className="app-header-identity">
        <span>{contributor.name}</span>
        <button type="button" className="linklike" onClick={onEdit}>
          edit my info
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/IdentityGate.tsx src/components/IdentityGate.test.tsx src/components/Header.tsx
git commit -m "feat: add identity gate and header"
```

---

## Task 8: Point form

**Files:**
- Create: `src/components/PointForm.tsx`, `src/components/PointForm.test.tsx`

**Interfaces:**
- Consumes: config constants (Task 2), `validateDraft` / `firstError` (Task 5), `formatCoordinates` (Task 3).
- Produces:
  - `<PointForm draft={PointDraft | null} onChange={(draft: PointDraft) => void} onSubmit={() => void} onCancel={() => void} isEditing={boolean} />`

**Behavior notes that the tests pin down:**
- Class and year render a placeholder option and start unselected.
- The free-text box exists in the DOM only when class is `other`.
- Submit is disabled while invalid, and the blocking reason is displayed.
- The form is a controlled component — it owns no draft state; `App` does.

- [ ] **Step 1: Write the failing test**

`src/components/PointForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PointDraft } from '../types'
import { currentYear } from '../config'
import PointForm from './PointForm'

function makeDraft(overrides: Partial<PointDraft> = {}): PointDraft {
  return {
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: null,
    classOther: '',
    year: null,
    floodable: 'unknown',
    confidence: 'certain',
    notes: '',
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

function renderForm(draft: PointDraft | null, props: Partial<Record<string, unknown>> = {}) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <PointForm
      draft={draft}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isEditing={false}
      {...props}
    />,
  )
  return { onChange, onSubmit, onCancel }
}

describe('PointForm — no point placed', () => {
  it('prompts the contributor to place a point', () => {
    renderForm(null)
    expect(screen.getByText(/place a point/i)).toBeInTheDocument()
  })

  it('does not render the class dropdown', () => {
    renderForm(null)
    expect(screen.queryByLabelText(/landcover/i)).not.toBeInTheDocument()
  })
})

describe('PointForm — fields', () => {
  it('shows the placed coordinates', () => {
    renderForm(makeDraft())
    expect(screen.getByText(/34\.500000, -91\.000000/)).toBeInTheDocument()
  })

  it('starts with no class selected', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('')
  })

  it('starts with no year selected', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/year/i)).toHaveValue('')
  })

  it('lists all ten classes plus the placeholder', () => {
    renderForm(makeDraft())
    const select = screen.getByLabelText(/landcover/i)
    expect(select.querySelectorAll('option')).toHaveLength(11)
  })

  it('lists years newest first starting at the current year', () => {
    renderForm(makeDraft())
    const options = screen.getByLabelText(/year/i).querySelectorAll('option')
    expect(options[1].textContent).toBe(String(currentYear()))
  })

  it('does not offer any year before 2020', () => {
    renderForm(makeDraft())
    const values = Array.from(
      screen.getByLabelText(/year/i).querySelectorAll('option'),
    ).map((option) => option.getAttribute('value'))
    expect(values).not.toContain('2019')
  })

  it('defaults floodable to unknown', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/flooded/i)).toHaveValue('unknown')
  })

  it('defaults confidence to certain', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/confident/i)).toHaveValue('certain')
  })
})

describe('PointForm — the "other" free-text box', () => {
  it('is absent for an ordinary class', () => {
    renderForm(makeDraft({ landcoverClass: 'rice' }))
    expect(screen.queryByLabelText(/describe/i)).not.toBeInTheDocument()
  })

  it('appears when the class is "other"', () => {
    renderForm(makeDraft({ landcoverClass: 'other' }))
    expect(screen.getByLabelText(/describe/i)).toBeInTheDocument()
  })
})

describe('PointForm — change propagation', () => {
  it('reports a class selection to the parent', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice/dirty')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ landcoverClass: 'rice/dirty' }),
    )
  })

  it('reports the year as a number, not a string', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2022')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ year: 2022 }))
  })

  it('reports notes as they are typed', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.type(screen.getByLabelText(/notes/i), 'x')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notes: 'x' }))
  })
})

describe('PointForm — submit gating', () => {
  it('disables submit when the class is missing', () => {
    renderForm(makeDraft({ year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('states the reason submit is blocked', () => {
    renderForm(makeDraft({ year: 2023 }))
    expect(screen.getByText(/choose a landcover class/i)).toBeInTheDocument()
  })

  it('disables submit when the year is missing', () => {
    renderForm(makeDraft({ landcoverClass: 'rice' }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('disables submit for "other" with no free text', () => {
    renderForm(makeDraft({ landcoverClass: 'other', classOther: '', year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('enables submit once class and year are set', () => {
    renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeEnabled()
  })

  it('calls onSubmit when a valid form is submitted', async () => {
    const { onSubmit } = renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }))
    await userEvent.click(screen.getByRole('button', { name: /submit|save/i }))
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('PointForm — editing mode', () => {
  it('labels the button "Save changes" when editing', () => {
    renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }), { isEditing: true })
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('offers a cancel action when editing', async () => {
    const { onCancel } = renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }), {
      isEditing: true,
    })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- PointForm`
Expected: FAIL — cannot resolve `./PointForm`.

- [ ] **Step 3: Write `src/components/PointForm.tsx`**

```tsx
import {
  CONFIDENCE_OPTIONS,
  FLOODABLE_OPTIONS,
  LANDCOVER_CLASSES,
  NOTES_MAX_LENGTH,
  OTHER_CLASS,
  availableYears,
} from '../config'
import type { LandcoverClass, PointDraft } from '../types'
import { formatCoordinates } from '../lib/coordinates'
import { firstError, validateDraft } from '../lib/validation'

interface Props {
  draft: PointDraft | null
  onChange: (draft: PointDraft) => void
  onSubmit: () => void
  onCancel: () => void
  isEditing: boolean
}

export default function PointForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
}: Props) {
  if (!draft) {
    return (
      <div className="point-form point-form-empty">
        <p>
          Place a point to get started — tap the map, use your location, paste
          coordinates, or search for a place.
        </p>
      </div>
    )
  }

  const result = validateDraft(draft)
  const blockingReason = firstError(result)

  function update(patch: Partial<PointDraft>) {
    onChange({ ...draft!, ...patch })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (result.valid) onSubmit()
  }

  return (
    <form className="point-form" onSubmit={handleSubmit}>
      <p className="point-coordinates">
        {formatCoordinates(draft.latitude, draft.longitude)}
      </p>

      <label htmlFor="landcover-class">Landcover class</label>
      <select
        id="landcover-class"
        value={draft.landcoverClass ?? ''}
        onChange={(event) =>
          update({
            landcoverClass: (event.target.value || null) as LandcoverClass | null,
            // Drop stale free text when moving away from "other".
            classOther: event.target.value === OTHER_CLASS ? draft.classOther : '',
          })
        }
      >
        <option value="">Choose one…</option>
        {LANDCOVER_CLASSES.map((className) => (
          <option key={className} value={className}>
            {className}
          </option>
        ))}
      </select>

      {draft.landcoverClass === OTHER_CLASS ? (
        <>
          <label htmlFor="class-other">Describe the landcover</label>
          <input
            id="class-other"
            type="text"
            value={draft.classOther}
            onChange={(event) => update({ classOther: event.target.value })}
          />
        </>
      ) : null}

      <label htmlFor="point-year">Year</label>
      <select
        id="point-year"
        value={draft.year === null ? '' : String(draft.year)}
        onChange={(event) =>
          update({ year: event.target.value ? Number(event.target.value) : null })
        }
      >
        <option value="">Choose one…</option>
        {availableYears().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <label htmlFor="point-floodable">Can this ground be flooded?</label>
      <select
        id="point-floodable"
        value={draft.floodable}
        onChange={(event) =>
          update({ floodable: event.target.value as PointDraft['floodable'] })
        }
      >
        {FLOODABLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="point-confidence">How confident are you?</label>
      <select
        id="point-confidence"
        value={draft.confidence}
        onChange={(event) =>
          update({ confidence: event.target.value as PointDraft['confidence'] })
        }
      >
        {CONFIDENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="point-notes">Notes (optional)</label>
      <textarea
        id="point-notes"
        rows={3}
        maxLength={NOTES_MAX_LENGTH}
        value={draft.notes}
        onChange={(event) => update({ notes: event.target.value })}
      />

      {blockingReason ? <p className="form-blocked">{blockingReason}</p> : null}

      <div className="point-form-actions">
        <button type="submit" disabled={!result.valid}>
          {isEditing ? 'Save changes' : 'Submit point'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- PointForm`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/PointForm.tsx src/components/PointForm.test.tsx
git commit -m "feat: add point entry form with submit gating"
```

---

## Task 9: Session list

**Files:**
- Create: `src/components/SessionList.tsx`, `src/components/SessionList.test.tsx`

**Interfaces:**
- Consumes: `StoredPoint` (Task 2), `toCsv` / `downloadCsv` (Task 4), `formatCoordinates` (Task 3).
- Produces:
  - `<SessionList points={StoredPoint[]} onEdit={(point) => void} onDelete={(id) => void} onSelect={(point) => void} />`

**Behavior:** delete asks for confirmation before firing, because an accidental delete destroys work. `downloadCsv` is mocked in tests — it is DOM plumbing, not logic.

- [ ] **Step 1: Write the failing test**

`src/components/SessionList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredPoint } from '../types'
import SessionList from './SessionList'

const downloadCsv = vi.hoisted(() => vi.fn())
vi.mock('../lib/csv', async () => {
  const actual = await vi.importActual<typeof import('../lib/csv')>('../lib/csv')
  return { ...actual, downloadCsv }
})

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: 'token',
    contributorName: 'Ryan Askren',
    contributorEmail: 'ryanaskren@gmail.com',
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: null,
    year: 2023,
    floodable: 'yes',
    confidence: 'certain',
    notes: null,
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

beforeEach(() => {
  downloadCsv.mockClear()
})

describe('SessionList — empty', () => {
  it('says nothing has been submitted yet', () => {
    render(
      <SessionList points={[]} onEdit={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />,
    )
    expect(screen.getByText(/no points yet/i)).toBeInTheDocument()
  })

  it('disables the download button', () => {
    render(
      <SessionList points={[]} onEdit={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })
})

describe('SessionList — with points', () => {
  it('shows a count', () => {
    render(
      <SessionList
        points={[makePoint({ id: 'a' }), makePoint({ id: 'b' })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 points/i)).toBeInTheDocument()
  })

  it('uses the singular for one point', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 point\b/i)).toBeInTheDocument()
  })

  it('shows the class and year of each point', () => {
    render(
      <SessionList
        points={[makePoint({ landcoverClass: 'rice/dirty', year: 2022 })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/rice\/dirty/)).toBeInTheDocument()
    expect(screen.getByText(/2022/)).toBeInTheDocument()
  })

  it('shows the free text instead of "other" for an other-class point', () => {
    render(
      <SessionList
        points={[makePoint({ landcoverClass: 'other', classOther: 'buckwheat' })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/buckwheat/)).toBeInTheDocument()
  })

  it('shows the coordinates of each point', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/34\.500000, -91\.000000/)).toBeInTheDocument()
  })

  it('calls onEdit for the chosen point', async () => {
    const onEdit = vi.fn()
    const point = makePoint()
    render(
      <SessionList
        points={[point]}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onEdit).toHaveBeenCalledWith(point)
  })

  it('calls onSelect when the point summary is clicked, to recenter the map', async () => {
    const onSelect = vi.fn()
    const point = makePoint()
    render(
      <SessionList
        points={[point]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={onSelect}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /show on map/i }))
    expect(onSelect).toHaveBeenCalledWith(point)
  })
})

describe('SessionList — delete confirmation', () => {
  it('does not delete on the first click', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes after the confirmation is clicked', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint({ id: 'doomed' })]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledWith('doomed')
  })

  it('can be backed out of', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })
})

describe('SessionList — CSV download', () => {
  it('downloads the points as CSV', async () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /download/i }))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toMatch(/\.csv$/)
    expect(csv).toContain('landcover_class')
  })

  it('warns that the local list is per-browser', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/this browser/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- SessionList`
Expected: FAIL — cannot resolve `./SessionList`.

- [ ] **Step 3: Write `src/components/SessionList.tsx`**

```tsx
import { useState } from 'react'
import type { StoredPoint } from '../types'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatCoordinates } from '../lib/coordinates'

interface Props {
  points: StoredPoint[]
  onEdit: (point: StoredPoint) => void
  onDelete: (id: string) => void
  onSelect: (point: StoredPoint) => void
}

function describeClass(point: StoredPoint): string {
  return point.landcoverClass === 'other' && point.classOther
    ? point.classOther
    : point.landcoverClass
}

export default function SessionList({ points, onEdit, onDelete, onSelect }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  function handleDownload() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`landcover-points-${stamp}.csv`, toCsv(points))
  }

  return (
    <section className="session-list">
      <div className="session-list-header">
        <h2>Your points</h2>
        <span>
          {points.length} {points.length === 1 ? 'point' : 'points'}
        </span>
      </div>

      {points.length === 0 ? (
        <p className="session-list-empty">No points yet — submit one to see it here.</p>
      ) : (
        <ul>
          {points.map((point) => (
            <li key={point.id}>
              <button
                type="button"
                className="session-point-summary"
                onClick={() => onSelect(point)}
                aria-label={`Show on map: ${describeClass(point)} ${point.year}`}
              >
                <strong>{describeClass(point)}</strong>
                <span>{point.year}</span>
                <span className="session-point-coords">
                  {formatCoordinates(point.latitude, point.longitude)}
                </span>
              </button>

              {pendingDelete === point.id ? (
                <div className="session-point-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(point.id)
                      setPendingDelete(null)
                    }}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPendingDelete(null)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="session-point-actions">
                  <button type="button" onClick={() => onEdit(point)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPendingDelete(point.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={handleDownload} disabled={points.length === 0}>
        Download my points (CSV)
      </button>
      <p className="session-list-note">
        This list is saved in this browser only. Your submitted points are safe in the
        project database either way, but clearing your browser data will empty this list.
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- SessionList`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionList.tsx src/components/SessionList.test.tsx
git commit -m "feat: add session list with edit, delete, and CSV download"
```

---

## Task 10: Map, coordinate input, and place search

**Files:**
- Create: `src/lib/geocode.ts`, `src/lib/geocode.test.ts`, `src/components/CoordinateInput.tsx`, `src/components/CoordinateInput.test.tsx`, `src/components/PlaceSearch.tsx`, `src/components/MapPanel.tsx`

**Interfaces:**
- Consumes: `parseCoordinates` (Task 3), `DEFAULT_MAP_VIEW` (Task 2).
- Produces:
  - `searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]>` where `PlaceResult = { label: string; latitude: number; longitude: number }`
  - `<CoordinateInput onPlace={(lat: number, lng: number) => void} />`
  - `<PlaceSearch onPlace={(lat: number, lng: number) => void} />`
  - `<MapPanel draftPosition={{lat,lng} | null} points={StoredPoint[]} focus={{lat,lng} | null} onPlace={(lat, lng, method: PlacementMethod, accuracyM: number | null) => void} />`

**Reminder:** `MapPanel` is not unit-tested. See the "Testing note: Leaflet and jsdom" section. Its logic lives in the two tested modules above it.

- [ ] **Step 1: Write the failing geocode test**

`src/lib/geocode.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from './geocode'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('searchPlaces', () => {
  it('returns an empty list for a blank query without calling the network', async () => {
    const fetchMock = stubFetch([])
    expect(await searchPlaces('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty list for a one-character query', async () => {
    const fetchMock = stubFetch([])
    expect(await searchPlaces('s')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps Nominatim results into label and coordinates', async () => {
    stubFetch([
      { display_name: 'Stuttgart, Arkansas', lat: '34.5', lon: '-91.55' },
      { display_name: 'Bayou Meto WMA', lat: '34.3', lon: '-91.7' },
    ])
    const results = await searchPlaces('stuttgart')
    expect(results).toEqual([
      { label: 'Stuttgart, Arkansas', latitude: 34.5, longitude: -91.55 },
      { label: 'Bayou Meto WMA', latitude: 34.3, longitude: -91.7 },
    ])
  })

  it('requests JSON format with a result limit', async () => {
    const fetchMock = stubFetch([])
    await searchPlaces('stuttgart')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('format=json')
    expect(url).toContain('limit=')
  })

  it('url-encodes the query', async () => {
    const fetchMock = stubFetch([])
    await searchPlaces('bayou meto & rice')
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent('bayou meto & rice'),
    )
  })

  it('drops results with unparseable coordinates', async () => {
    stubFetch([
      { display_name: 'Good', lat: '34.5', lon: '-91.55' },
      { display_name: 'Bad', lat: 'nonsense', lon: '-91.7' },
    ])
    const results = await searchPlaces('x')
    expect(results).toHaveLength(1)
    expect(results[0].label).toBe('Good')
  })

  it('returns an empty list when the service errors', async () => {
    stubFetch([], false)
    expect(await searchPlaces('stuttgart')).toEqual([])
  })

  it('returns an empty list when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await searchPlaces('stuttgart')).toEqual([])
  })

  it('returns an empty list when the payload is not an array', async () => {
    stubFetch({ error: 'rate limited' })
    expect(await searchPlaces('stuttgart')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- geocode`
Expected: FAIL — cannot resolve `./geocode`.

- [ ] **Step 3: Write `src/lib/geocode.ts`**

```ts
/**
 * Place search via OSM Nominatim.
 *
 * Nominatim's usage policy caps this at roughly one request per second, so the
 * caller must debounce. Every failure mode returns an empty list rather than
 * throwing — a search box that explodes on a flaky network is worse than one
 * that finds nothing.
 */

export interface PlaceResult {
  label: string
  latitude: number
  longitude: number
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 5

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  const url = `${ENDPOINT}?format=json&limit=${RESULT_LIMIT}&q=${encodeURIComponent(trimmed)}`

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return []
    const payload = await response.json()
    if (!Array.isArray(payload)) return []

    return payload
      .map((item: { display_name?: string; lat?: string; lon?: string }) => ({
        label: String(item.display_name ?? ''),
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }))
      .filter(
        (result) =>
          result.label.length > 0 &&
          Number.isFinite(result.latitude) &&
          Number.isFinite(result.longitude),
      )
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- geocode`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing CoordinateInput test**

`src/components/CoordinateInput.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoordinateInput from './CoordinateInput'

describe('CoordinateInput', () => {
  it('places a point from decimal degrees', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), '34.5, -91.0')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).toHaveBeenCalledWith(34.5, -91.0)
  })

  it('places a point from DMS', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), `34°30'00"N 91°00'00"W`)
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).toHaveBeenCalled()
    const [lat, lng] = onPlace.mock.calls[0]
    expect(lat).toBeCloseTo(34.5, 5)
    expect(lng).toBeCloseTo(-91.0, 5)
  })

  it('shows an error for unparseable input and does not place', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), 'somewhere')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).not.toHaveBeenCalled()
    expect(screen.getByText(/could not read/i)).toBeInTheDocument()
  })

  it('clears the error once the input becomes valid', async () => {
    render(<CoordinateInput onPlace={vi.fn()} />)
    const input = screen.getByLabelText(/coordinates/i)
    await userEvent.type(input, 'nope')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(screen.getByText(/could not read/i)).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '34.5, -91.0')
    expect(screen.queryByText(/could not read/i)).not.toBeInTheDocument()
  })

  it('submits on Enter', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), '34.5, -91.0{Enter}')
    expect(onPlace).toHaveBeenCalledWith(34.5, -91.0)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- CoordinateInput`
Expected: FAIL — cannot resolve `./CoordinateInput`.

- [ ] **Step 7: Write `src/components/CoordinateInput.tsx`**

```tsx
import { useState } from 'react'
import { parseCoordinates } from '../lib/coordinates'

interface Props {
  onPlace: (latitude: number, longitude: number) => void
}

export default function CoordinateInput({ onPlace }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseCoordinates(text)
    if (!parsed) {
      setError('Could not read those coordinates. Try "34.5, -91.0".')
      return
    }
    setError('')
    onPlace(parsed.latitude, parsed.longitude)
  }

  return (
    <form className="coordinate-input" onSubmit={handleSubmit}>
      <label htmlFor="coordinate-text">Coordinates</label>
      <div className="input-row">
        <input
          id="coordinate-text"
          type="text"
          placeholder="34.5, -91.0"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
        />
        <button type="submit">Go</button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  )
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -- CoordinateInput`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write `src/components/PlaceSearch.tsx`**

Not unit-tested — `searchPlaces` carries all the logic and is fully covered. This is a debounce plus a result list.

```tsx
import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceResult } from '../lib/geocode'

interface Props {
  onPlace: (latitude: number, longitude: number) => void
}

/** Nominatim's usage policy is about one request per second. */
const DEBOUNCE_MS = 600

export default function PlaceSearch({ onPlace }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setSearching(true)
      const found = await searchPlaces(query, controller.signal)
      setSearching(false)
      setResults(found)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="place-search">
      <label htmlFor="place-query">Search for a place</label>
      <input
        id="place-query"
        type="search"
        placeholder="Stuttgart, Arkansas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {searching ? <p className="place-search-status">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="place-search-results">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude},${result.label}`}>
              <button
                type="button"
                onClick={() => {
                  onPlace(result.latitude, result.longitude)
                  setResults([])
                  setQuery('')
                }}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="attribution">Search by OpenStreetMap Nominatim</p>
    </div>
  )
}
```

- [ ] **Step 10: Write `src/components/MapPanel.tsx`**

Two implementation details that will otherwise cost an hour of debugging:

1. **Leaflet's default marker icon breaks under bundlers** because it resolves image paths relative to the CSS. This uses `L.divIcon` with inline SVG instead, which sidesteps asset resolution entirely.
2. **Leaflet's stylesheet must be imported** or the map renders as a scrambled pile of tiles.

```tsx
import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  LayersControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { DEFAULT_MAP_VIEW } from '../config'
import type { PlacementMethod, StoredPoint } from '../types'

interface Props {
  draftPosition: { lat: number; lng: number } | null
  points: StoredPoint[]
  focus: { lat: number; lng: number } | null
  onPlace: (
    latitude: number,
    longitude: number,
    method: PlacementMethod,
    accuracyM: number | null,
  ) => void
}

function pinIcon(color: string) {
  return L.divIcon({
    className: 'map-pin',
    html: `<svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22c0-6.6-5.4-12-12-12z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  })
}

const DRAFT_ICON = pinIcon('#d94801')
const SUBMITTED_ICON = pinIcon('#2b6cb0')

function ClickHandler({ onPlace }: Pick<Props, 'onPlace'>) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng, 'map_click', null)
    },
  })
  return null
}

function FocusController({ focus }: Pick<Props, 'focus'>) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 13))
  }, [focus, map])
  return null
}

export default function MapPanel({ draftPosition, points, focus, onPlace }: Props) {
  return (
    <div className="map-panel">
      <MapContainer
        center={[DEFAULT_MAP_VIEW.lat, DEFAULT_MAP_VIEW.lng]}
        zoom={DEFAULT_MAP_VIEW.zoom}
        className="map-container"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Imagery">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Streets">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Place labels">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.Overlay>
        </LayersControl>

        <ClickHandler onPlace={onPlace} />
        <FocusController focus={focus} />

        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={SUBMITTED_ICON}
          />
        ))}

        {draftPosition ? (
          <Marker
            position={[draftPosition.lat, draftPosition.lng]}
            icon={DRAFT_ICON}
            draggable
            eventHandlers={{
              dragend(event) {
                const { lat, lng } = (event.target as L.Marker).getLatLng()
                onPlace(lat, lng, 'map_click', null)
              },
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  )
}
```

- [ ] **Step 11: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 12: Commit**

```bash
git add src/lib/geocode.ts src/lib/geocode.test.ts src/components/CoordinateInput.tsx \
  src/components/CoordinateInput.test.tsx src/components/PlaceSearch.tsx src/components/MapPanel.tsx
git commit -m "feat: add map panel, coordinate input, and place search"
```

---

## Task 11: Wire the local-only app — Stage 1 complete

**Files:**
- Modify: `src/App.tsx` (replace the Task 1 placeholder entirely)
- Create: `src/App.test.tsx`
- Create: `src/lib/points.ts`, `src/lib/points.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–10.
- Produces:
  - `emptyDraft(latitude, longitude, method, accuracyM): PointDraft`
  - `draftToStoredPoint(draft, contributor, sessionToken, id, now): StoredPoint`
  - `storedPointToDraft(point): PointDraft`
  - A running app that collects points into local storage.

**Why `points.ts` exists:** converting a draft into a stored point involves the `other`/`classOther` nulling rule and the `gps_accuracy_m` rule, both of which must exactly match the database constraints in Task 12. That is real logic and belongs in a tested module, not inline in a component.

- [ ] **Step 1: Write the failing points test**

`src/lib/points.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PointDraft } from '../types'
import { draftToStoredPoint, emptyDraft, storedPointToDraft } from './points'

const contributor = { name: 'Ryan Askren', email: 'ryanaskren@gmail.com' }
const NOW = '2026-07-31T12:00:00.000Z'

function makeDraft(overrides: Partial<PointDraft> = {}): PointDraft {
  return { ...emptyDraft(34.5, -91.0, 'map_click', null), ...overrides }
}

describe('emptyDraft', () => {
  it('leaves class and year unset so nothing is submitted by default', () => {
    const draft = emptyDraft(34.5, -91.0, 'map_click', null)
    expect(draft.landcoverClass).toBeNull()
    expect(draft.year).toBeNull()
  })

  it('defaults floodable to unknown and confidence to certain', () => {
    const draft = emptyDraft(34.5, -91.0, 'map_click', null)
    expect(draft.floodable).toBe('unknown')
    expect(draft.confidence).toBe('certain')
  })

  it('records the placement method and gps accuracy', () => {
    const draft = emptyDraft(34.5, -91.0, 'device_gps', 4.7)
    expect(draft.placementMethod).toBe('device_gps')
    expect(draft.gpsAccuracyM).toBe(4.7)
  })
})

describe('draftToStoredPoint', () => {
  it('carries the contributor and session token onto the point', () => {
    const point = draftToStoredPoint(
      makeDraft({ landcoverClass: 'rice', year: 2023 }),
      contributor,
      'token-1',
      'id-1',
      NOW,
    )
    expect(point.contributorName).toBe('Ryan Askren')
    expect(point.contributorEmail).toBe('ryanaskren@gmail.com')
    expect(point.sessionToken).toBe('token-1')
    expect(point.id).toBe('id-1')
    expect(point.createdAt).toBe(NOW)
    expect(point.updatedAt).toBe(NOW)
  })

  it('nulls class_other for an ordinary class, matching the DB constraint', () => {
    const draft = makeDraft({
      landcoverClass: 'rice',
      classOther: 'leftover text',
      year: 2023,
    })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).classOther).toBeNull()
  })

  it('keeps trimmed class_other for the "other" class', () => {
    const draft = makeDraft({
      landcoverClass: 'other',
      classOther: '  buckwheat  ',
      year: 2023,
    })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).classOther).toBe(
      'buckwheat',
    )
  })

  it('nulls empty notes rather than storing an empty string', () => {
    const draft = makeDraft({ landcoverClass: 'rice', year: 2023, notes: '   ' })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).notes).toBeNull()
  })

  it('trims notes that have content', () => {
    const draft = makeDraft({ landcoverClass: 'rice', year: 2023, notes: '  east half ' })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).notes).toBe('east half')
  })

  it('nulls gps accuracy when the placement method was not device GPS', () => {
    const draft = makeDraft({
      landcoverClass: 'rice',
      year: 2023,
      placementMethod: 'map_click',
      gpsAccuracyM: 9.9,
    })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).gpsAccuracyM).toBeNull()
  })

  it('keeps gps accuracy for a device GPS placement', () => {
    const draft = makeDraft({
      landcoverClass: 'rice',
      year: 2023,
      placementMethod: 'device_gps',
      gpsAccuracyM: 4.7,
    })
    expect(draftToStoredPoint(draft, contributor, 't', 'i', NOW).gpsAccuracyM).toBe(4.7)
  })
})

describe('storedPointToDraft', () => {
  it('round-trips a point back into an editable draft', () => {
    const point = draftToStoredPoint(
      makeDraft({ landcoverClass: 'other', classOther: 'buckwheat', year: 2023 }),
      contributor,
      't',
      'i',
      NOW,
    )
    const draft = storedPointToDraft(point)
    expect(draft.landcoverClass).toBe('other')
    expect(draft.classOther).toBe('buckwheat')
    expect(draft.year).toBe(2023)
  })

  it('turns null class_other and notes back into empty strings for the form', () => {
    const point = draftToStoredPoint(
      makeDraft({ landcoverClass: 'rice', year: 2023 }),
      contributor,
      't',
      'i',
      NOW,
    )
    const draft = storedPointToDraft(point)
    expect(draft.classOther).toBe('')
    expect(draft.notes).toBe('')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- points`
Expected: FAIL — cannot resolve `./points`.

- [ ] **Step 3: Write `src/lib/points.ts`**

```ts
import { OTHER_CLASS } from '../config'
import type {
  ContributorInfo,
  LandcoverClass,
  PlacementMethod,
  PointDraft,
  StoredPoint,
} from '../types'

/**
 * Draft <-> stored point conversion. The nulling rules here must stay in lockstep
 * with the CHECK constraints in supabase/schema.sql, or inserts will be rejected
 * by the database after passing client validation.
 */

export function emptyDraft(
  latitude: number,
  longitude: number,
  placementMethod: PlacementMethod,
  gpsAccuracyM: number | null,
): PointDraft {
  return {
    latitude,
    longitude,
    landcoverClass: null,
    classOther: '',
    year: null,
    floodable: 'unknown',
    confidence: 'certain',
    notes: '',
    placementMethod,
    gpsAccuracyM,
  }
}

export function draftToStoredPoint(
  draft: PointDraft,
  contributor: ContributorInfo,
  sessionToken: string,
  id: string,
  now: string,
): StoredPoint {
  const notes = draft.notes.trim()
  return {
    id,
    createdAt: now,
    updatedAt: now,
    sessionToken,
    contributorName: contributor.name,
    contributorEmail: contributor.email,
    latitude: draft.latitude,
    longitude: draft.longitude,
    landcoverClass: draft.landcoverClass as LandcoverClass,
    classOther:
      draft.landcoverClass === OTHER_CLASS ? draft.classOther.trim() || null : null,
    year: draft.year as number,
    floodable: draft.floodable,
    confidence: draft.confidence,
    notes: notes || null,
    placementMethod: draft.placementMethod,
    gpsAccuracyM: draft.placementMethod === 'device_gps' ? draft.gpsAccuracyM : null,
  }
}

export function storedPointToDraft(point: StoredPoint): PointDraft {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    landcoverClass: point.landcoverClass,
    classOther: point.classOther ?? '',
    year: point.year,
    floodable: point.floodable,
    confidence: point.confidence,
    notes: point.notes ?? '',
    placementMethod: point.placementMethod,
    gpsAccuracyM: point.gpsAccuracyM,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- points`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing App test**

`src/App.test.tsx`. `MapPanel` is mocked with a button that fires `onPlace`, since Leaflet cannot render in jsdom — that is what makes the whole submit flow testable.

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadPoints } from './lib/storage'

vi.mock('./components/MapPanel', () => ({
  default: ({ onPlace }: { onPlace: (a: number, b: number, c: string, d: null) => void }) => (
    <button type="button" onClick={() => onPlace(34.5, -91.0, 'map_click', null)}>
      simulate map click
    </button>
  ),
}))

beforeEach(() => {
  localStorage.clear()
})

async function signIn() {
  await userEvent.type(screen.getByLabelText(/name/i), 'Ryan Askren')
  await userEvent.type(screen.getByLabelText(/email/i), 'ryanaskren@gmail.com')
  await userEvent.click(screen.getByRole('button', { name: /start mapping/i }))
}

async function submitPoint(landcoverClass: string, year: string) {
  await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
  await userEvent.selectOptions(screen.getByLabelText(/landcover/i), landcoverClass)
  await userEvent.selectOptions(screen.getByLabelText(/year/i), year)
  await userEvent.click(screen.getByRole('button', { name: /submit point/i }))
}

describe('App — identity gate', () => {
  it('shows the identity gate on first visit', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start mapping/i })).toBeInTheDocument()
  })

  it('shows the map once identity is provided', async () => {
    render(<App />)
    await signIn()
    expect(screen.getByRole('button', { name: /simulate map click/i })).toBeInTheDocument()
  })

  it('skips the gate on a return visit', async () => {
    const { unmount } = render(<App />)
    await signIn()
    unmount()

    render(<App />)
    expect(screen.queryByRole('button', { name: /start mapping/i })).not.toBeInTheDocument()
  })

  it('reopens the gate via "edit my info"', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /edit my info/i }))
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })
})

describe('App — submitting points', () => {
  it('persists a submitted point to local storage', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')

    const stored = loadPoints()
    expect(stored).toHaveLength(1)
    expect(stored[0].landcoverClass).toBe('rice')
    expect(stored[0].year).toBe(2023)
    expect(stored[0].contributorName).toBe('Ryan Askren')
  })

  it('shows the point in the session list', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(screen.getByText(/1 point\b/i)).toBeInTheDocument()
  })

  it('clears class after submit so the next point starts fresh', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('')
  })

  it('retains the year after submit, since people work one year at a time', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2022')
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/year/i)).toHaveValue('2022')
  })

  it('retains floodable after submit', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    await userEvent.selectOptions(screen.getByLabelText(/flooded/i), 'yes')
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice')
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))

    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/flooded/i)).toHaveValue('yes')
  })

  it('accumulates multiple points', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await submitPoint('corn', '2022')
    expect(loadPoints()).toHaveLength(2)
    expect(screen.getByText(/2 points/i)).toBeInTheDocument()
  })
})

describe('App — editing and deleting', () => {
  it('loads a point back into the form for editing', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('rice')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('writes an edit through to storage without adding a row', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'corn')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const stored = loadPoints()
    expect(stored).toHaveLength(1)
    expect(stored[0].landcoverClass).toBe('corn')
  })

  it('deletes a point after confirmation', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(loadPoints()).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- App`
Expected: FAIL — App still renders the Task 1 placeholder heading.

- [ ] **Step 7: Write `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import Header from './components/Header'
import IdentityGate from './components/IdentityGate'
import MapPanel from './components/MapPanel'
import PointForm from './components/PointForm'
import SessionList from './components/SessionList'
import CoordinateInput from './components/CoordinateInput'
import PlaceSearch from './components/PlaceSearch'
import type { ContributorInfo, PlacementMethod, PointDraft, StoredPoint } from './types'
import { draftToStoredPoint, emptyDraft, storedPointToDraft } from './lib/points'
import {
  addPoint,
  getSessionToken,
  loadContributor,
  loadPoints,
  newId,
  removePoint,
  saveContributor,
  updatePoint,
} from './lib/storage'

export default function App() {
  const [contributor, setContributor] = useState<ContributorInfo | null>(null)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [points, setPoints] = useState<StoredPoint[]>([])
  const [draft, setDraft] = useState<PointDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [status, setStatus] = useState('')
  // Carried forward between points: contributors work one year at a time.
  const [lastYear, setLastYear] = useState<number | null>(null)
  const [lastFloodable, setLastFloodable] = useState<PointDraft['floodable']>('unknown')

  useEffect(() => {
    setContributor(loadContributor())
    setPoints(loadPoints())
  }, [])

  function handlePlace(
    latitude: number,
    longitude: number,
    method: PlacementMethod,
    accuracyM: number | null,
  ) {
    setFocus({ lat: latitude, lng: longitude })
    setDraft((current) =>
      current
        ? { ...current, latitude, longitude, placementMethod: method, gpsAccuracyM: accuracyM }
        : {
            ...emptyDraft(latitude, longitude, method, accuracyM),
            year: lastYear,
            floodable: lastFloodable,
          },
    )
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setStatus('This browser cannot report your location.')
      return
    }
    setStatus('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('')
        handlePlace(
          position.coords.latitude,
          position.coords.longitude,
          'device_gps',
          position.coords.accuracy ?? null,
        )
      },
      () => setStatus('Could not get your location. Check location permissions.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  function handleSubmit() {
    if (!draft || !contributor) return
    const now = new Date().toISOString()

    if (editingId) {
      const existing = points.find((point) => point.id === editingId)
      const updated = {
        ...draftToStoredPoint(draft, contributor, getSessionToken(), editingId, now),
        createdAt: existing?.createdAt ?? now,
      }
      setPoints(updatePoint(updated))
      setStatus('Point updated.')
      setEditingId(null)
    } else {
      const point = draftToStoredPoint(
        draft,
        contributor,
        getSessionToken(),
        newId(),
        now,
      )
      setPoints(addPoint(point))
      setStatus('Point submitted.')
    }

    setLastYear(draft.year)
    setLastFloodable(draft.floodable)
    setDraft(null)
  }

  function handleEdit(point: StoredPoint) {
    setEditingId(point.id)
    setDraft(storedPointToDraft(point))
    setFocus({ lat: point.latitude, lng: point.longitude })
  }

  function handleDelete(id: string) {
    setPoints(removePoint(id))
    if (editingId === id) {
      setEditingId(null)
      setDraft(null)
    }
    setStatus('Point deleted.')
  }

  function handleCancel() {
    setDraft(null)
    setEditingId(null)
  }

  if (!contributor || editingIdentity) {
    return (
      <IdentityGate
        initial={contributor}
        onSave={(info) => {
          saveContributor(info)
          setContributor(info)
          setEditingIdentity(false)
        }}
        onCancel={contributor ? () => setEditingIdentity(false) : undefined}
      />
    )
  }

  return (
    <div className="app">
      <Header contributor={contributor} onEdit={() => setEditingIdentity(true)} />

      <main className="app-body">
        <MapPanel
          draftPosition={draft ? { lat: draft.latitude, lng: draft.longitude } : null}
          points={points}
          focus={focus}
          onPlace={handlePlace}
        />

        <aside className="app-sidebar">
          <div className="placement-tools">
            <button type="button" onClick={handleUseMyLocation}>
              Use my location
            </button>
            <CoordinateInput
              onPlace={(lat, lng) => handlePlace(lat, lng, 'coordinates', null)}
            />
            <PlaceSearch onPlace={(lat, lng) => handlePlace(lat, lng, 'search', null)} />
          </div>

          {status ? (
            <p className="app-status" role="status">
              {status}
            </p>
          ) : null}

          <PointForm
            draft={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditing={editingId !== null}
          />

          <SessionList
            points={points}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSelect={(point) => setFocus({ lat: point.latitude, lng: point.longitude })}
          />
        </aside>
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Check the state declaration order**

`handlePlace` reads `lastYear` and `lastFloodable`. `const` bindings are not hoisted, so both `useState` calls must appear above `handlePlace` in the component body — they are grouped with the other state declarations in the code above. If you reordered anything, confirm this still holds; otherwise the first map click throws "Cannot access 'lastYear' before initialization".

- [ ] **Step 9: Run the App tests**

Run: `npm test -- App`
Expected: PASS, 13 tests.

- [ ] **Step 10: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 11: Verify the real app in a browser**

This is the only verification `MapPanel` gets, so do it properly.

Run: `npm run dev`, open `http://localhost:5173/LandcoverTruthing/`, and confirm each of:

1. The identity gate appears; entering a name and email dismisses it.
2. Imagery tiles load and the basemap switcher (top right) toggles imagery / labels / streets.
3. Clicking the map drops an orange pin and the form appears with the coordinates shown.
4. Dragging the pin updates the coordinates.
5. Pasting `34°30'00"N 91°00'00"W` into the coordinate box and pressing Go moves the pin.
6. Searching "Stuttgart, Arkansas" returns results and clicking one moves the pin.
7. Submitting turns the pin blue and adds it to "Your points".
8. "Download my points (CSV)" produces a file that opens correctly in a spreadsheet.
9. Reloading the page keeps the points and does not re-ask for identity.

Fix anything that fails before committing.

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/lib/points.ts src/lib/points.test.ts
git commit -m "feat: wire local-only point collection app (stage 1)"
```

---

## Task 12: Supabase schema, constraints, and row-level security

**Files:**
- Create: `supabase/schema.sql`, `supabase/verify.sql`

**Interfaces:**
- Consumes: the column names produced by `toRow` (Task 4) and the nulling rules in `points.ts` (Task 11).
- Produces: a live `public.landcover_points` table with RLS enabled, and a recorded project URL and anon key in `.env`.

**Prerequisite:** a Supabase project must exist. If it does not, stop and ask the owner to create one at supabase.com and supply the project URL and anon key. Do not proceed on a guess.

**How the session token reaches the database:** PostgREST exposes request headers to SQL through `current_setting('request.headers', true)`. The browser client sends `x-session-token` on every request (Task 13), and the RLS policies compare it to the row's `session_token`. This is what confines a contributor to their own rows without any login.

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
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

  constraint landcover_class_allowed check (landcover_class in (
    'moist-soil', 'corn/dirty', 'rice/dirty', 'other ag/dirty',
    'corn', 'rice', 'millet', 'milo', 'sunflowers', 'other'
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
```

- [ ] **Step 2: Apply the schema**

Open the Supabase dashboard → SQL Editor → paste `supabase/schema.sql` → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Write `supabase/verify.sql`**

An untested constraint is not a constraint. This script asserts each one rejects what it should. It runs as the table owner in the SQL editor, so it verifies the CHECKs and triggers; RLS is verified from the browser in Task 13.

```sql
-- Constraint verification. Run in the Supabase SQL editor after schema.sql.
-- Every block must report the expected outcome. Nothing is left behind.

do $$
declare
  token uuid := gen_random_uuid();
  ok boolean;
begin
  -- A valid row inserts.
  insert into public.landcover_points (
    session_token, contributor_name, contributor_email,
    latitude, longitude, landcover_class, year,
    floodable, confidence, placement_method
  ) values (
    token, 'Verify Script', 'verify@example.com',
    34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
  );
  raise notice 'PASS: valid row accepted';

  -- Unknown landcover class is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'soybeans', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: bad landcover_class was accepted'; end if;
  raise notice 'PASS: unknown landcover_class rejected';

  -- "other" without free text is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'other', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: other without class_other was accepted'; end if;
  raise notice 'PASS: other without free text rejected';

  -- Non-"other" class carrying free text is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, class_other, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 'stale text', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: stale class_other was accepted'; end if;
  raise notice 'PASS: stale class_other rejected';

  -- Year below the 2020 floor is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 2019, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: year 2019 was accepted'; end if;
  raise notice 'PASS: year below floor rejected';

  -- Future year is rejected by the trigger (raises a plain exception).
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', extract(year from now())::int + 1,
      'unknown', 'certain', 'map_click'
    );
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: future year was accepted'; end if;
  raise notice 'PASS: future year rejected';

  -- Out-of-range latitude is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'verify@example.com',
      95.0, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: latitude 95 was accepted'; end if;
  raise notice 'PASS: out-of-range latitude rejected';

  -- gps_accuracy_m without device_gps is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method, gps_accuracy_m
    ) values (
      token, 'Verify Script', 'verify@example.com',
      34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click', 4.7
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: stray gps_accuracy_m was accepted'; end if;
  raise notice 'PASS: gps_accuracy_m without device_gps rejected';

  -- Malformed email is rejected.
  ok := false;
  begin
    insert into public.landcover_points (
      session_token, contributor_name, contributor_email,
      latitude, longitude, landcover_class, year,
      floodable, confidence, placement_method
    ) values (
      token, 'Verify Script', 'not-an-email',
      34.5, -91.0, 'rice', 2023, 'unknown', 'certain', 'map_click'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: malformed email was accepted'; end if;
  raise notice 'PASS: malformed email rejected';

  -- Clean up every row this script created.
  delete from public.landcover_points where session_token = token;
  raise notice 'ALL CONSTRAINT CHECKS PASSED';
end;
$$;
```

- [ ] **Step 4: Run the verification script**

Paste `supabase/verify.sql` into the SQL editor and Run.
Expected: the Results panel shows nine `PASS:` notices followed by `ALL CONSTRAINT CHECKS PASSED`. Any `FAIL:` means a constraint is missing — fix `schema.sql`, re-run it, and re-verify before continuing.

- [ ] **Step 5: Confirm the table is empty**

Run in the SQL editor: `select count(*) from public.landcover_points;`
Expected: `0`. The verification script cleans up after itself; a non-zero count means it did not finish.

- [ ] **Step 6: Record the credentials**

From the Supabase dashboard, Settings → API, copy the Project URL and the `anon` `public` key into a new `.env` at the repo root:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

`.env` is git-ignored (Task 1). Do not commit it. The anon key is not a secret in the security sense — it ships in the built bundle — but keeping it out of git means rotating it does not require a history rewrite.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql supabase/verify.sql
git commit -m "feat: add Supabase schema, constraints, and row-level security"
```

---

## Task 13: Supabase client and write-through sync

**Files:**
- Create: `src/lib/supabaseClient.ts`, `src/lib/supabaseClient.test.ts`
- Modify: `src/App.tsx` — make submit, edit, and delete write through to the database
- Modify: `src/App.test.tsx` — mock the Supabase module

**Interfaces:**
- Consumes: `toRow` (Task 4), `getSessionToken` (Task 6), `StoredPoint` (Task 2).
- Produces:
  - `isBackendConfigured(): boolean`
  - `savePointRemote(point: StoredPoint): Promise<void>` — upsert on `id`, so a retry after a timeout cannot duplicate
  - `deletePointRemote(id: string): Promise<void>`
  - Both reject with an `Error` whose message is safe to show a contributor.

**Sync model:** the database write happens first. Only on success does the point enter local storage and the session list. A failure leaves the form filled so the contributor can retry, and the error is displayed. There is no offline queue and no "unsynced" state — a contributor is never shown a point that is not actually saved.

Because the id is generated client-side and the write is an upsert, retrying a request that timed out but actually succeeded is harmless.

- [ ] **Step 1: Write the failing test**

`src/lib/supabaseClient.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredPoint } from '../types'

const upsert = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
const eq = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient }))

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: '22222222-2222-4222-8222-222222222222',
    contributorName: 'Ryan Askren',
    contributorEmail: 'ryanaskren@gmail.com',
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: null,
    year: 2023,
    floodable: 'yes',
    confidence: 'certain',
    notes: null,
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  eq.mockResolvedValue({ error: null })
  del.mockReturnValue({ eq })
  upsert.mockResolvedValue({ error: null })
  from.mockReturnValue({ upsert, delete: del })
  createClient.mockReturnValue({ from })
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})

describe('isBackendConfigured', () => {
  it('is true when both env vars are present', async () => {
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(true)
  })

  it('is false when the url is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(false)
  })

  it('is false when the anon key is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(false)
  })
})

describe('savePointRemote', () => {
  it('writes to the landcover_points table', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    expect(from).toHaveBeenCalledWith('landcover_points')
  })

  it('upserts on id so a retry cannot duplicate the row', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'point-1' }),
      { onConflict: 'id' },
    )
  })

  it('sends snake_case column names', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    const [row] = upsert.mock.calls[0]
    expect(row).toHaveProperty('landcover_class', 'rice')
    expect(row).toHaveProperty('placement_method', 'map_click')
    expect(row).not.toHaveProperty('landcoverClass')
  })

  it('sends the session token header so RLS can identify the contributor', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    const options = createClient.mock.calls[0][2]
    expect(options.global.headers).toHaveProperty('x-session-token')
  })

  it('throws a readable error when the write is rejected', async () => {
    upsert.mockResolvedValue({ error: { message: 'new row violates row-level security' } })
    const mod = await import('./supabaseClient')
    await expect(mod.savePointRemote(makePoint())).rejects.toThrow(/could not be saved/i)
  })

  it('throws when the backend is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const mod = await import('./supabaseClient')
    await expect(mod.savePointRemote(makePoint())).rejects.toThrow(/not configured/i)
  })
})

describe('deletePointRemote', () => {
  it('deletes the row by id', async () => {
    const mod = await import('./supabaseClient')
    await mod.deletePointRemote('point-1')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'point-1')
  })

  it('throws a readable error when the delete is rejected', async () => {
    eq.mockResolvedValue({ error: { message: 'permission denied' } })
    const mod = await import('./supabaseClient')
    await expect(mod.deletePointRemote('point-1')).rejects.toThrow(/could not be deleted/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- supabaseClient`
Expected: FAIL — cannot resolve `./supabaseClient`.

- [ ] **Step 3: Write `src/lib/supabaseClient.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { StoredPoint } from '../types'
import { toRow } from './mapping'
import { getSessionToken } from './storage'

/**
 * Direct browser access to Supabase. The anon key is public by design; row-level
 * security is the enforcement layer. The x-session-token header is what the RLS
 * policies compare against each row's session_token column.
 */

const TABLE = 'landcover_points'

/**
 * Read statically. Vite replaces `import.meta.env.VITE_*` at build time, and
 * dynamic indexing like `import.meta.env[name]` is not reliably substituted in
 * a production bundle — it would work in dev and return undefined once deployed.
 */
function env(): { url: string; key: string } {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    key: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  }
}

export function isBackendConfigured(): boolean {
  const { url, key } = env()
  return Boolean(url && key)
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!isBackendConfigured()) {
    throw new Error(
      'The submission server is not configured. Contact the project owner.',
    )
  }
  if (!client) {
    const { url, key } = env()
    client = createClient(url, key, {
      auth: { persistSession: false },
      global: { headers: { 'x-session-token': getSessionToken() } },
    })
  }
  return client
}

export async function savePointRemote(point: StoredPoint): Promise<void> {
  // Upsert on the client-generated id: retrying a request that timed out but
  // actually succeeded overwrites the row instead of duplicating it.
  const { error } = await getClient()
    .from(TABLE)
    .upsert(toRow(point), { onConflict: 'id' })

  if (error) {
    throw new Error(`Your point could not be saved: ${error.message}`)
  }
}

export async function deletePointRemote(id: string): Promise<void> {
  const { error } = await getClient().from(TABLE).delete().eq('id', id)

  if (error) {
    throw new Error(`That point could not be deleted: ${error.message}`)
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- supabaseClient`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the backend mock to `src/App.test.tsx`**

Insert immediately after the existing `vi.mock('./components/MapPanel', ...)` block:

```tsx
const savePointRemote = vi.hoisted(() => vi.fn())
const deletePointRemote = vi.hoisted(() => vi.fn())
vi.mock('./lib/supabaseClient', () => ({
  isBackendConfigured: () => true,
  savePointRemote,
  deletePointRemote,
}))
```

And extend the existing `beforeEach` to reset them:

```tsx
beforeEach(() => {
  localStorage.clear()
  savePointRemote.mockReset().mockResolvedValue(undefined)
  deletePointRemote.mockReset().mockResolvedValue(undefined)
})
```

- [ ] **Step 6: Add failing sync tests to `src/App.test.tsx`**

Append this block at the end of the file:

```tsx
describe('App — backend sync', () => {
  it('sends a submitted point to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(savePointRemote).toHaveBeenCalledTimes(1)
    expect(savePointRemote.mock.calls[0][0]).toMatchObject({
      landcoverClass: 'rice',
      year: 2023,
    })
  })

  it('does not store the point locally when the database write fails', async () => {
    savePointRemote.mockRejectedValue(new Error('Your point could not be saved: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(loadPoints()).toHaveLength(0)
  })

  it('shows the failure and keeps the form filled so the contributor can retry', async () => {
    savePointRemote.mockRejectedValue(new Error('Your point could not be saved: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(screen.getByText(/could not be saved/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('rice')
  })

  it('succeeds on retry after a transient failure', async () => {
    savePointRemote
      .mockRejectedValueOnce(new Error('Your point could not be saved: offline'))
      .mockResolvedValue(undefined)
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))
    expect(loadPoints()).toHaveLength(1)
  })

  it('sends an edit to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'corn')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(savePointRemote).toHaveBeenCalledTimes(2)
    expect(savePointRemote.mock.calls[1][0]).toMatchObject({ landcoverClass: 'corn' })
  })

  it('sends a delete to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    const id = loadPoints()[0].id
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(deletePointRemote).toHaveBeenCalledWith(id)
  })

  it('keeps the point locally when the remote delete fails', async () => {
    deletePointRemote.mockRejectedValue(new Error('That point could not be deleted: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(loadPoints()).toHaveLength(1)
    expect(screen.getByText(/could not be deleted/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run the App tests to verify the new ones fail**

Run: `npm test -- App`
Expected: the seven new tests FAIL — `App` does not call the backend yet. The original 13 still pass.

- [ ] **Step 8: Make submit, edit, and delete write through in `src/App.tsx`**

Add the import:

```tsx
import { deletePointRemote, savePointRemote } from './lib/supabaseClient'
```

Add a submitting flag alongside the other state:

```tsx
const [submitting, setSubmitting] = useState(false)
```

Replace `handleSubmit` entirely with this async version. The shape is: build the point, write it remotely, and only touch local state after the write resolves.

```tsx
  async function handleSubmit() {
    if (!draft || !contributor || submitting) return
    const now = new Date().toISOString()
    const existing = editingId ? points.find((p) => p.id === editingId) : undefined
    const point = {
      ...draftToStoredPoint(
        draft,
        contributor,
        getSessionToken(),
        editingId ?? newId(),
        now,
      ),
      createdAt: existing?.createdAt ?? now,
    }

    setSubmitting(true)
    setStatus('Saving…')
    try {
      await savePointRemote(point)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Your point could not be saved.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)

    setPoints(editingId ? updatePoint(point) : addPoint(point))
    setStatus(editingId ? 'Point updated.' : 'Point submitted.')
    setEditingId(null)
    setLastYear(draft.year)
    setLastFloodable(draft.floodable)
    setDraft(null)
  }
```

Replace `handleDelete` with the async version:

```tsx
  async function handleDelete(id: string) {
    setStatus('Deleting…')
    try {
      await deletePointRemote(id)
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'That point could not be deleted.',
      )
      return
    }
    setPoints(removePoint(id))
    if (editingId === id) {
      setEditingId(null)
      setDraft(null)
    }
    setStatus('Point deleted.')
  }
```

- [ ] **Step 9: Run the App tests**

Run: `npm test -- App`
Expected: PASS, 20 tests.

- [ ] **Step 10: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 11: Verify against the real database, including RLS**

This is the step that proves the security model works. `npm run dev`, then:

1. Submit a point. Confirm it appears in the Supabase dashboard's Table Editor.
2. Edit that point in the app; confirm the row updates rather than duplicating.
3. Delete it; confirm the row disappears.
4. **Cross-contributor isolation:** submit a point, then open the app in a private window (which gets a fresh session token) and submit a different point. In the browser console of the private window, run:

```js
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const c = createClient('<VITE_SUPABASE_URL>', '<VITE_SUPABASE_ANON_KEY>')
const { data } = await c.from('landcover_points').select('*')
console.log(data)
```

Expected: an empty array. A client with no `x-session-token` header must see no rows. If it returns rows, RLS is not working — stop and fix `schema.sql` before deploying.

5. Confirm both points are visible in the Supabase dashboard (the owner sees everything).
6. Delete the test rows from the dashboard.

- [ ] **Step 12: Commit**

```bash
git add src/lib/supabaseClient.ts src/lib/supabaseClient.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: write points through to Supabase with session-token RLS"
```

---

## Task 14: Responsive styling, README, and deployment

**Files:**
- Create: `src/styles.css`, `README.md`, `.github/workflows/deploy.yml`
- Modify: `src/main.tsx` — import the stylesheet

**Interfaces:**
- Consumes: the class names used across Tasks 7–11.
- Produces: a deployed app at `https://askrenr.github.io/LandcoverTruthing/`.

**Prerequisite:** the `askrenr/LandcoverTruthing` GitHub repo must exist and Pages must be set to deploy from GitHub Actions. Step 5 covers creating it.

**Layout contract:** one breakpoint at 900px. Above it, map and sidebar sit side by side with the sidebar at a fixed 380px. Below it, the map takes the top 45vh and the sidebar scrolls beneath it.

- [ ] **Step 1: Write `src/styles.css`**

```css
:root {
  --bg: #ffffff;
  --surface: #f6f7f9;
  --border: #d7dbe0;
  --text: #1a1d21;
  --muted: #5c646e;
  --accent: #2b6cb0;
  --danger: #c53030;
  --sidebar-width: 380px;
  --breakpoint: 900px;
}

* { box-sizing: border-box; }

html, body, #root {
  height: 100%;
  margin: 0;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--bg);
  font-size: 16px; /* below 16px, iOS Safari zooms on focus */
}

.app { display: flex; flex-direction: column; height: 100%; }

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.app-header h1 { font-size: 1.1rem; margin: 0; }
.app-header-identity { display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; }

.app-body { display: flex; flex: 1; min-height: 0; }

.map-panel { flex: 1; min-width: 0; }
.map-container { height: 100%; width: 100%; }

.app-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  overflow-y: auto;
  padding: 1rem;
  border-left: 1px solid var(--border);
  background: var(--bg);
}

@media (max-width: 900px) {
  .app-body { flex-direction: column; }
  .map-panel { height: 45vh; flex: none; }
  .app-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

label {
  display: block;
  margin-top: 0.8rem;
  margin-bottom: 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}

input, select, textarea {
  width: 100%;
  padding: 0.6rem;
  font-size: 1rem;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
}

button {
  padding: 0.65rem 1rem;
  font-size: 0.95rem;
  font-family: inherit;
  font-weight: 600;
  color: #ffffff;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  min-height: 44px; /* touch target */
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
button.danger { background: var(--danger); }
button.linklike {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0;
  min-height: 0;
  text-decoration: underline;
  font-weight: 400;
}

.input-row { display: flex; gap: 0.5rem; }
.input-row input { flex: 1; }
.input-row button { flex-shrink: 0; }

.field-error, .form-blocked {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--danger);
}

.app-status {
  margin: 0.8rem 0;
  padding: 0.6rem;
  font-size: 0.9rem;
  background: var(--surface);
  border-radius: 6px;
}

.placement-tools > button { width: 100%; }
.attribution { font-size: 0.75rem; color: var(--muted); margin: 0.3rem 0 0; }

.point-form, .session-list {
  margin-top: 1.2rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--border);
}
.point-coordinates { font-family: ui-monospace, "SF Mono", monospace; font-size: 0.9rem; margin: 0; }
.point-form-actions, .identity-actions, .session-point-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.place-search-results { list-style: none; margin: 0.4rem 0 0; padding: 0; }
.place-search-results button {
  width: 100%;
  text-align: left;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  font-weight: 400;
  font-size: 0.9rem;
}
.place-search-status { font-size: 0.85rem; color: var(--muted); margin: 0.4rem 0 0; }

.session-list-header { display: flex; justify-content: space-between; align-items: baseline; }
.session-list-header h2 { font-size: 1rem; margin: 0; }
.session-list ul { list-style: none; margin: 0.6rem 0; padding: 0; }
.session-list li {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}
.session-point-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  background: none;
  color: var(--text);
  font-weight: 400;
  padding: 0;
}
.session-point-coords { font-family: ui-monospace, "SF Mono", monospace; font-size: 0.8rem; color: var(--muted); }
.session-point-actions button { flex: 1; font-size: 0.85rem; padding: 0.45rem; }
.session-list-note, .session-list-empty { font-size: 0.8rem; color: var(--muted); }
.session-list > button { width: 100%; margin-top: 0.6rem; }

.identity-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 1.5rem;
  background: var(--surface);
}
.identity-card {
  width: 100%;
  max-width: 520px;
  padding: 1.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.identity-card h1 { margin-top: 0; font-size: 1.4rem; }
.identity-card p { line-height: 1.5; color: var(--muted); }
.identity-privacy { font-size: 0.9rem; }

.map-pin { background: none; border: none; }

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --surface: #1f2226;
    --border: #343941;
    --text: #eceef1;
    --muted: #a2abb6;
    --accent: #5b9bd5;
  }
}
```

- [ ] **Step 2: Import the stylesheet in `src/main.tsx`**

Add as the first import:

```tsx
import './styles.css'
```

- [ ] **Step 3: Verify the responsive layout**

Run: `npm run dev`, open `http://localhost:5173/LandcoverTruthing/`, and confirm:

1. At desktop width, map and sidebar sit side by side and the sidebar scrolls independently.
2. Narrowing the window past 900px stacks the map above the sidebar with no horizontal scrollbar on `body`.
3. In device emulation at iPhone width, buttons are comfortably tappable and focusing an input does not zoom the page.
4. The whole flow — place, fill, submit, edit, delete, download — works at phone width.
5. If your OS is in dark mode, the dark palette applies and text stays readable.

- [ ] **Step 4: Write `README.md`**

````markdown
# LandcoverTruthing

Collects ground-truth landcover labels from people who personally know the ground,
as training data for remote sensing classification of waterfowl habitat.

A contributor opens the link, drops a pin on a field they know, picks what was
planted there and in what year, and submits. Points pool into a Supabase table
that the project owner exports as CSV.

**Live app:** https://askrenr.github.io/LandcoverTruthing/

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
````

- [ ] **Step 5: Create the GitHub repo**

```bash
cd ~/LandcoverTruthing
gh repo create askrenr/LandcoverTruthing --public --source=. --remote=origin
```

If the repo already exists, add the remote instead:

```bash
git remote add origin https://github.com/askrenr/LandcoverTruthing.git
```

- [ ] **Step 6: Add the build secrets**

The anon key is not sensitive — it ships in the bundle regardless — but keeping it in secrets rather than in the repo means rotating it does not require rewriting history.

```bash
gh secret set VITE_SUPABASE_URL --repo askrenr/LandcoverTruthing
gh secret set VITE_SUPABASE_ANON_KEY --repo askrenr/LandcoverTruthing
```

Each prompts for the value; paste the ones recorded in `.env` during Task 12.

- [ ] **Step 7: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci

      - run: npm test

      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

The build runs the test suite first, so a red suite blocks deployment.

- [ ] **Step 8: Enable Pages and push**

```bash
gh api -X POST repos/askrenr/LandcoverTruthing/pages \
  -f "build_type=workflow" 2>/dev/null || \
  gh api -X PUT repos/askrenr/LandcoverTruthing/pages -f "build_type=workflow"
```

If that fails, set it by hand: repo Settings → Pages → Source → GitHub Actions.

```bash
git add -A
git commit -m "feat: add responsive styling, README, and Pages deployment"
git push -u origin main
```

- [ ] **Step 9: Confirm the deployment**

```bash
gh run watch --repo askrenr/LandcoverTruthing
```

Expected: the workflow succeeds. Then open `https://askrenr.github.io/LandcoverTruthing/` and confirm:

1. The page loads with no console errors. A blank page with 404s on `/assets/*` means the `base` in `vite.config.ts` does not match the repo name.
2. Map tiles load.
3. Submitting a point from the deployed site writes a row visible in the Supabase dashboard.
4. Delete that test row from the dashboard.

- [ ] **Step 10: Final verification**

Run: `npm test && npm run build`
Expected: all tests pass and the build completes with no type errors.

```bash
git status --short
```

Expected: clean.

---

## Post-implementation

Send contributors `https://askrenr.github.io/LandcoverTruthing/`.

To export: Supabase dashboard → Table Editor → `landcover_points` → Export as CSV.
