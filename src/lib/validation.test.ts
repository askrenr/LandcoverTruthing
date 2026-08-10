import { describe, expect, it } from 'vitest'
import type { ContributorInfo, PointDraft } from '../types'
import { currentYear } from '../config'
import { firstError, validateContributor, validateDraft } from './validation'

function makeDraft(overrides: Partial<PointDraft> = {}): PointDraft {
  return {
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: '',
    harvested: 'unknown',
    year: 2023,
    floodable: 'unknown',
    confidence: 'certain',
    notes: '',
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

function makeContributor(overrides: Partial<ContributorInfo> = {}): ContributorInfo {
  return { name: 'Ryan Askren', email: 'ryanaskren@gmail.com', ...overrides }
}

describe('validateDraft — happy path', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(makeDraft()).valid).toBe(true)
  })

  it('accepts an "other" draft with free text supplied', () => {
    const draft = makeDraft({ landcoverClass: 'other', classOther: 'buckwheat' })
    expect(validateDraft(draft).valid).toBe(true)
  })

  it('accepts every year from the floor to the current year', () => {
    for (const year of [2020, 2022, currentYear()]) {
      expect(validateDraft(makeDraft({ year })).valid).toBe(true)
    }
  })
})

describe('validateDraft — class', () => {
  it('rejects a missing class', () => {
    const result = validateDraft(makeDraft({ landcoverClass: null }))
    expect(result.valid).toBe(false)
    expect(result.errors.landcoverClass).toMatch(/class/i)
  })

  it('requires free text when the class is "other"', () => {
    const result = validateDraft(makeDraft({ landcoverClass: 'other', classOther: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.classOther).toBeTruthy()
  })

  it('rejects whitespace-only free text for "other"', () => {
    const result = validateDraft(
      makeDraft({ landcoverClass: 'other', classOther: '   ' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.classOther).toBeTruthy()
  })

  it('ignores stray free text when the class is not "other"', () => {
    const draft = makeDraft({ landcoverClass: 'rice', classOther: 'leftover text' })
    expect(validateDraft(draft).valid).toBe(true)
  })
})

describe('validateDraft — year', () => {
  it('rejects a missing year', () => {
    const result = validateDraft(makeDraft({ year: null }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toMatch(/year/i)
  })

  it('rejects a year before the 2020 floor', () => {
    const result = validateDraft(makeDraft({ year: 2019 }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toContain('2020')
  })

  it('rejects a year in the future', () => {
    const result = validateDraft(makeDraft({ year: currentYear() + 1 }))
    expect(result.valid).toBe(false)
    expect(result.errors.year).toBeTruthy()
  })
})

describe('validateDraft — location', () => {
  it('rejects an out-of-range latitude', () => {
    const result = validateDraft(makeDraft({ latitude: 95 }))
    expect(result.valid).toBe(false)
    expect(result.errors.location).toBeTruthy()
  })

  it('rejects an out-of-range longitude', () => {
    expect(validateDraft(makeDraft({ longitude: 200 })).valid).toBe(false)
  })

  it('rejects NaN coordinates', () => {
    expect(validateDraft(makeDraft({ latitude: NaN })).valid).toBe(false)
  })

  it('accepts coordinates anywhere on earth, since there is no study-area limit', () => {
    expect(validateDraft(makeDraft({ latitude: -33.9, longitude: 151.2 })).valid).toBe(
      true,
    )
  })
})

describe('validateDraft — notes', () => {
  it('accepts empty notes', () => {
    expect(validateDraft(makeDraft({ notes: '' })).valid).toBe(true)
  })

  it('rejects notes longer than 1000 characters', () => {
    const result = validateDraft(makeDraft({ notes: 'x'.repeat(1001) }))
    expect(result.valid).toBe(false)
    expect(result.errors.notes).toBeTruthy()
  })

  it('accepts notes of exactly 1000 characters', () => {
    expect(validateDraft(makeDraft({ notes: 'x'.repeat(1000) })).valid).toBe(true)
  })
})

describe('validateDraft — enumerations', () => {
  it('rejects a floodable value outside the allowed set', () => {
    const draft = makeDraft({ floodable: 'maybe' as never })
    expect(validateDraft(draft).valid).toBe(false)
  })

  it('rejects a confidence value outside the allowed set', () => {
    const draft = makeDraft({ confidence: 'sure' as never })
    expect(validateDraft(draft).valid).toBe(false)
  })
})

describe('firstError', () => {
  it('returns null for a valid draft', () => {
    expect(firstError(validateDraft(makeDraft()))).toBeNull()
  })

  it('returns a human-readable reason for an invalid draft', () => {
    const message = firstError(validateDraft(makeDraft({ landcoverClass: null })))
    expect(message).toMatch(/class/i)
  })
})

describe('validateContributor', () => {
  it('accepts a name and email', () => {
    expect(validateContributor(makeContributor()).valid).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = validateContributor(makeContributor({ name: '  ' }))
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeTruthy()
  })

  it('rejects an empty email', () => {
    expect(validateContributor(makeContributor({ email: '' })).valid).toBe(false)
  })

  it('rejects an email with no @ sign', () => {
    const result = validateContributor(makeContributor({ email: 'not-an-email' }))
    expect(result.valid).toBe(false)
    expect(result.errors.email).toBeTruthy()
  })

  it('rejects an email with no domain dot', () => {
    expect(validateContributor(makeContributor({ email: 'a@b' })).valid).toBe(false)
  })

  it('accepts an email with a plus tag', () => {
    const info = makeContributor({ email: 'ryan+ducks@example.com' })
    expect(validateContributor(info).valid).toBe(true)
  })
})
