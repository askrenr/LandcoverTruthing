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
