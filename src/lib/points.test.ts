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
