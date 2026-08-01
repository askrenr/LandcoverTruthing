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
