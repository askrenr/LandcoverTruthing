/**
 * Capture date of the Esri World Imagery basemap under a given point.
 *
 * Esri publishes the imagery footprints alongside the tiles: the same
 * MapServer that serves World_Imagery answers `identify` with the acquisition
 * date, ground resolution, and provider of whichever scene was mosaicked in
 * there. This is the service behind the "where is this imagery from?" popup in
 * ArcGIS Online.
 *
 * The footprints are stacked by zoom, not by area: a point can sit under a
 * 0.3 m 2025 scene that only draws from level 12 up AND a 15 m undated base
 * layer that draws below it. Reporting the wrong one is worse than reporting
 * nothing, so the caller's zoom picks the footprint and a zoom no footprint
 * claims returns null.
 *
 * Every failure mode returns null rather than throwing — an unavailable date is
 * a missing caption, not a broken map.
 */

const ENDPOINT =
  'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify'

/** World Imagery plus its three resolution tiers; 4+ are citation duplicates. */
const METADATA_LAYERS = '0,1,2,3'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export interface ImagerySource {
  /** Capture date as YYYY-MM-DD, or null when the tier publishes none. */
  date: string | null
  /** Ground sample distance in metres, or null when unparseable. */
  resolutionM: number | null
  /** Imagery provider, e.g. 'Vantor', 'Earthstar Geographics'. */
  source: string | null
}

/** Esri writes absent string attributes as the literal 'Null'. */
function attr(attributes: Record<string, unknown>, key: string): string | null {
  const value = attributes[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' || trimmed === 'Null' ? null : trimmed
}

function num(attributes: Record<string, unknown>, key: string): number | null {
  const raw = attr(attributes, key)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** 'YYYYMMDD' — the only date field Esri fills consistently. */
function parseDate(attributes: Record<string, unknown>): string | null {
  const raw = attr(attributes, 'DATE (YYYYMMDD)')
  if (raw === null || !/^\d{8}$/.test(raw)) return null
  const [year, month, day] = [raw.slice(0, 4), raw.slice(4, 6), raw.slice(6, 8)]
  if (Number(month) < 1 || Number(month) > 12) return null
  if (Number(day) < 1 || Number(day) > 31) return null
  return `${year}-${month}-${day}`
}

interface Candidate {
  objectId: string | null
  minLevel: number
  drawOrder: number
  imagery: ImagerySource
}

function toCandidate(result: unknown): Candidate | null {
  if (typeof result !== 'object' || result === null) return null
  const attributes = (result as { attributes?: unknown }).attributes
  if (typeof attributes !== 'object' || attributes === null) return null
  const a = attributes as Record<string, unknown>

  const minLevel = num(a, 'MinMapLevel')
  const maxLevel = num(a, 'MaxMapLevel')
  if (minLevel === null || maxLevel === null) return null

  return {
    objectId: attr(a, 'OBJECTID'),
    minLevel,
    drawOrder: num(a, 'DrawOrder') ?? 0,
    imagery: {
      date: parseDate(a),
      resolutionM: num(a, 'RESOLUTION (M)'),
      source: attr(a, 'SOURCE'),
    },
  }
}

function coversZoom(result: unknown, zoom: number): boolean {
  const a = (result as { attributes?: Record<string, unknown> }).attributes
  if (!a) return false
  const min = num(a, 'MinMapLevel')
  const max = num(a, 'MaxMapLevel')
  return min !== null && max !== null && zoom >= min && zoom <= max
}

export async function fetchImagerySource(
  latitude: number,
  longitude: number,
  zoom: number,
  signal?: AbortSignal,
): Promise<ImagerySource | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  // identify insists on a map frame to resolve its tolerance against; a hair
  // either side of the point is enough to make the point the only hit.
  const pad = 0.0005
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      x: longitude,
      y: latitude,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    tolerance: '0',
    mapExtent: [longitude - pad, latitude - pad, longitude + pad, latitude + pad].join(','),
    imageDisplay: '256,256,96',
    returnGeometry: 'false',
    layers: `all:${METADATA_LAYERS}`,
    f: 'json',
  })

  let payload: unknown
  try {
    const response = await fetch(`${ENDPOINT}?${params}`, { signal })
    if (!response.ok) return null
    payload = await response.json()
  } catch {
    return null
  }

  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results)) return null

  const seen = new Set<string>()
  const candidates: Candidate[] = []
  for (const result of results) {
    if (!coversZoom(result, zoom)) continue
    const candidate = toCandidate(result)
    if (!candidate) continue
    if (candidate.objectId !== null) {
      if (seen.has(candidate.objectId)) continue
      seen.add(candidate.objectId)
    }
    candidates.push(candidate)
  }
  if (candidates.length === 0) return null

  // The tier that draws is the most specific one: highest floor first, then
  // whichever Esri stacks on top.
  candidates.sort((a, b) => b.minLevel - a.minLevel || b.drawOrder - a.drawOrder)
  return candidates[0].imagery
}

/** '27 Feb 2025' — spelled out so no locale can read 2/3/2025 backwards. */
export function formatImageryDate(date: string | null): string | null {
  if (date === null) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return null
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** The caption text, or null when there is nothing worth captioning. */
export function describeImagery(imagery: ImagerySource | null): string | null {
  if (!imagery) return null
  const parts: string[] = []
  const date = formatImageryDate(imagery.date)
  parts.push(date ?? 'date not published')
  if (imagery.resolutionM !== null) {
    const metres =
      imagery.resolutionM < 1
        ? `${imagery.resolutionM.toFixed(1)} m`
        : `${Math.round(imagery.resolutionM)} m`
    parts.push(metres)
  }
  if (imagery.source !== null) parts.push(imagery.source)
  return parts.join(' · ')
}
