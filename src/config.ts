/**
 * Single source of truth for the app's fixed vocabularies and defaults.
 * Adding a landcover class means editing LANDCOVER_CLASSES here AND migrating
 * the landcover_class CHECK constraint in supabase/schema.sql.
 */

export const LANDCOVER_CLASSES = [
  'moist-soil',
  'corn/dirty',
  'rice/dirty',
  'other ag/dirty',
  'corn',
  'rice',
  'millet',
  'milo',
  'sunflowers',
  // Natural wetland vegetation, as distinct from the planted classes above.
  'floating leaf',
  'buttonbush',
  'willow',
  'persistent emergent',
  'other',
] as const

/** The only class that reveals a free-text box. */
export const OTHER_CLASS = 'other'

export const FLOODABLE_OPTIONS = [
  { value: 'yes', label: 'Yes — it can be flooded' },
  { value: 'no', label: 'No — it cannot be flooded' },
  { value: 'unknown', label: "Unknown — I'm not sure" },
] as const

export const CONFIDENCE_OPTIONS = [
  { value: 'certain', label: 'Certain' },
  { value: 'fairly_sure', label: 'Fairly sure' },
  { value: 'best_guess', label: 'Best guess' },
] as const

export const PLACEMENT_METHODS = [
  'map_click',
  'device_gps',
  'coordinates',
  'search',
] as const

export const YEAR_FLOOR = 2020

export const NOTES_MAX_LENGTH = 1000

export const DEFAULT_MAP_VIEW = { lat: 34.5, lng: -91.0, zoom: 7 }

export function currentYear(): number {
  return new Date().getFullYear()
}

/** Years newest-first, current year down to YEAR_FLOOR. */
export function availableYears(): number[] {
  const years: number[] = []
  for (let y = currentYear(); y >= YEAR_FLOOR; y--) years.push(y)
  return years
}
