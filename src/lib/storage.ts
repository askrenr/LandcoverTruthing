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

/**
 * Guards only the fields the render path actually dereferences without a
 * null check (SessionList, MapPanel, CSV export). Deliberately permissive
 * about everything else — a stricter check would silently drop points that
 * are merely missing a field a future schema version adds.
 */
function isUsablePoint(value: unknown): value is StoredPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return (
    typeof point.id === 'string' &&
    point.id.length > 0 &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    typeof point.landcoverClass === 'string' &&
    point.landcoverClass.length > 0 &&
    Number.isFinite(point.year)
  )
}

export function loadPoints(): StoredPoint[] {
  const stored = readJson<StoredPoint[]>(POINTS_KEY)
  if (!Array.isArray(stored)) return []
  // Filter on read only — never write the filtered list back. Malformed
  // elements are left in local storage in case a future version can still
  // interpret them; the database is the durable record either way.
  return stored.filter(isUsablePoint)
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
