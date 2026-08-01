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
