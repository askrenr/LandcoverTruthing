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
