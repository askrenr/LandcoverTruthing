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

  it('rejects two hemisphere letters that name the same axis (both N/S)', () => {
    expect(parseCoordinates('34.5N, 45.0S')).toBeNull()
  })

  it('rejects two hemisphere letters that name the same axis (both E/W, same letter)', () => {
    expect(parseCoordinates('91.0W, 45.0W')).toBeNull()
  })

  it('rejects two hemisphere letters that name the same axis (both E/W, opposite letters)', () => {
    expect(parseCoordinates('91.0E, 45.0E')).toBeNull()
  })

  it('rejects more than two bare whitespace-separated numbers with no DMS indicator', () => {
    expect(parseCoordinates('34 5 -91 0')).toBeNull()
    expect(parseCoordinates('10 20 30 40')).toBeNull()
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
