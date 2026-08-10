import {
  CONFIDENCE_OPTIONS,
  FLOODABLE_OPTIONS,
  HARVESTED_OPTIONS,
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
  'harvested',
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

  // Checked for every class, not just the ag ones: a draft always carries a
  // harvested value, and draftToStoredPoint is what discards it for non-ag
  // classes. Letting a junk value through here would reach the database.
  if (!HARVESTED_OPTIONS.some((option) => option.value === draft.harvested)) {
    errors.harvested = 'Choose whether the crop was harvested.'
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
