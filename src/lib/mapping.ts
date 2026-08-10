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
    harvested: point.harvested,
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
    harvested: (row.harvested ?? null) as StoredPoint['harvested'],
    year: num(row.year),
    floodable: row.floodable as StoredPoint['floodable'],
    confidence: row.confidence as StoredPoint['confidence'],
    notes: (row.notes ?? null) as string | null,
    placementMethod: row.placement_method as StoredPoint['placementMethod'],
    gpsAccuracyM: nullableNum(row.gps_accuracy_m),
  }
}
