import { describe, expect, it } from 'vitest'
import schemaSql from '../supabase/schema.sql?raw'
import { LANDCOVER_CLASSES } from './config'

/**
 * The dropdown and the database CHECK constraint are two sources of truth that
 * must stay in lockstep: a class the UI offers but the DB rejects silently
 * loses the contributor's entry on write-through.
 */
function classesInSchemaConstraint(sql: string): string[] {
  const match = sql.match(
    /constraint landcover_class_allowed check \(landcover_class in \(([^)]*)\)\)/,
  )
  if (!match) throw new Error('landcover_class_allowed constraint not found in schema.sql')
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
}

describe('schema.sql / config lockstep', () => {
  const sql = schemaSql

  it('allows exactly the classes the dropdown offers, in the same order', () => {
    expect(classesInSchemaConstraint(sql)).toEqual([...LANDCOVER_CLASSES])
  })

  it('detects a constraint that is missing a class the UI offers', () => {
    const narrowed = sql.replace("'mature forest',\n    'other'", "'other'")
    expect(classesInSchemaConstraint(narrowed)).not.toContain('mature forest')
    expect(classesInSchemaConstraint(narrowed)).not.toEqual([...LANDCOVER_CLASSES])
  })
})
