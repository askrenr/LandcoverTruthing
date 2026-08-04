import { describe, expect, it } from 'vitest'
import {
  LANDCOVER_CLASSES,
  FLOODABLE_OPTIONS,
  CONFIDENCE_OPTIONS,
  YEAR_FLOOR,
  DEFAULT_MAP_VIEW,
  currentYear,
  availableYears,
} from './config'

describe('config', () => {
  it('lists the fourteen landcover classes in the agreed order', () => {
    expect(LANDCOVER_CLASSES).toEqual([
      'moist-soil',
      'corn/dirty',
      'rice/dirty',
      'other ag/dirty',
      'corn',
      'rice',
      'millet',
      'milo',
      'sunflowers',
      'floating leaf',
      'buttonbush',
      'willow',
      'persistent emergent',
      'other',
    ])
  })

  it('puts "other" last, since it is the free-text escape hatch', () => {
    expect(LANDCOVER_CLASSES[LANDCOVER_CLASSES.length - 1]).toBe('other')
  })

  it('has no duplicate class names', () => {
    expect(new Set(LANDCOVER_CLASSES).size).toBe(LANDCOVER_CLASSES.length)
  })

  it('offers the three floodable options with unknown available', () => {
    expect(FLOODABLE_OPTIONS.map((o) => o.value)).toEqual(['yes', 'no', 'unknown'])
  })

  it('offers the three confidence options', () => {
    expect(CONFIDENCE_OPTIONS.map((o) => o.value)).toEqual([
      'certain',
      'fairly_sure',
      'best_guess',
    ])
  })

  it('gives every option a human-readable label', () => {
    for (const option of [...FLOODABLE_OPTIONS, ...CONFIDENCE_OPTIONS]) {
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('sets the year floor at 2020', () => {
    expect(YEAR_FLOOR).toBe(2020)
  })

  it('derives the current year at runtime rather than hardcoding it', () => {
    expect(currentYear()).toBe(new Date().getFullYear())
  })

  it('lists years newest-first from the current year down to the floor', () => {
    const years = availableYears()
    expect(years[0]).toBe(currentYear())
    expect(years[years.length - 1]).toBe(YEAR_FLOOR)
    expect(years.length).toBe(currentYear() - YEAR_FLOOR + 1)
  })

  it('defaults the map to the Lower Mississippi Alluvial Valley', () => {
    expect(DEFAULT_MAP_VIEW).toEqual({ lat: 34.5, lng: -91.0, zoom: 7 })
  })
})
