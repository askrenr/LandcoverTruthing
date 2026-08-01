import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredPoint } from '../types'
import {
  addPoint,
  getSessionToken,
  loadContributor,
  loadPoints,
  newId,
  removePoint,
  saveContributor,
  savePoints,
  updatePoint,
} from './storage'

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: newId(),
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: getSessionToken(),
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

beforeEach(() => {
  localStorage.clear()
})

describe('getSessionToken', () => {
  it('creates a token on first call', () => {
    expect(getSessionToken()).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('returns the same token on subsequent calls', () => {
    expect(getSessionToken()).toBe(getSessionToken())
  })

  it('survives a reload by persisting to local storage', () => {
    const token = getSessionToken()
    expect(localStorage.getItem('lct.sessionToken')).toBe(token)
  })
})

describe('newId', () => {
  it('generates unique ids', () => {
    expect(newId()).not.toBe(newId())
  })
})

describe('contributor persistence', () => {
  it('returns null before anything is saved', () => {
    expect(loadContributor()).toBeNull()
  })

  it('round-trips a contributor', () => {
    saveContributor({ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' })
    expect(loadContributor()).toEqual({
      name: 'Ryan Askren',
      email: 'ryanaskren@gmail.com',
    })
  })

  it('overwrites on a second save, so "edit my info" works', () => {
    saveContributor({ name: 'First', email: 'first@example.com' })
    saveContributor({ name: 'Second', email: 'second@example.com' })
    expect(loadContributor()?.name).toBe('Second')
  })

  it('treats corrupt stored JSON as absent rather than crashing', () => {
    localStorage.setItem('lct.contributor', 'not json{{{')
    expect(loadContributor()).toBeNull()
  })

  it('treats a stored value missing required fields as absent', () => {
    localStorage.setItem('lct.contributor', JSON.stringify({ name: 'No email' }))
    expect(loadContributor()).toBeNull()
  })
})

describe('point persistence', () => {
  it('starts empty', () => {
    expect(loadPoints()).toEqual([])
  })

  it('round-trips saved points', () => {
    const point = makePoint()
    savePoints([point])
    expect(loadPoints()).toEqual([point])
  })

  it('treats corrupt stored JSON as an empty list', () => {
    localStorage.setItem('lct.points', '{{{not json')
    expect(loadPoints()).toEqual([])
  })

  it('treats a stored non-array as an empty list', () => {
    localStorage.setItem('lct.points', JSON.stringify({ nope: true }))
    expect(loadPoints()).toEqual([])
  })

  it('filters out a null element rather than crashing', () => {
    localStorage.setItem('lct.points', JSON.stringify([null]))
    expect(loadPoints()).toEqual([])
  })

  it('filters out a partial object missing fields the UI dereferences', () => {
    localStorage.setItem('lct.points', JSON.stringify([{ id: 'x' }]))
    expect(loadPoints()).toEqual([])
  })

  it('keeps a good point and drops a bad one from the same list', () => {
    const good = makePoint({ id: 'good' })
    localStorage.setItem('lct.points', JSON.stringify([good, null, { id: 'bad' }]))
    expect(loadPoints()).toEqual([good])
  })

  it('does not filter out a point merely missing a non-essential field', () => {
    const point = makePoint({ notes: undefined, gpsAccuracyM: undefined } as never)
    localStorage.setItem('lct.points', JSON.stringify([point]))
    const loaded = loadPoints()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe(point.id)
  })

  it('does not rewrite local storage when filtering on read', () => {
    const good = makePoint({ id: 'good' })
    const raw = JSON.stringify([good, null])
    localStorage.setItem('lct.points', raw)
    loadPoints()
    expect(localStorage.getItem('lct.points')).toBe(raw)
  })
})

describe('addPoint', () => {
  it('puts the newest point first, matching the session list order', () => {
    const older = makePoint({ id: 'older' })
    const newer = makePoint({ id: 'newer' })
    addPoint(older)
    const result = addPoint(newer)
    expect(result.map((p) => p.id)).toEqual(['newer', 'older'])
  })

  it('persists across a reload', () => {
    addPoint(makePoint({ id: 'kept' }))
    expect(loadPoints().map((p) => p.id)).toEqual(['kept'])
  })
})

describe('updatePoint', () => {
  it('replaces the matching point and leaves others alone', () => {
    addPoint(makePoint({ id: 'a', year: 2021 }))
    addPoint(makePoint({ id: 'b', year: 2022 }))
    const result = updatePoint(makePoint({ id: 'a', year: 2024 }))
    expect(result.find((p) => p.id === 'a')?.year).toBe(2024)
    expect(result.find((p) => p.id === 'b')?.year).toBe(2022)
  })

  it('preserves list order when updating', () => {
    addPoint(makePoint({ id: 'a' }))
    addPoint(makePoint({ id: 'b' }))
    const result = updatePoint(makePoint({ id: 'a', notes: 'edited' }))
    expect(result.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('leaves the list unchanged when the id is unknown', () => {
    addPoint(makePoint({ id: 'a' }))
    expect(updatePoint(makePoint({ id: 'ghost' }))).toHaveLength(1)
  })
})

describe('removePoint', () => {
  it('removes the matching point', () => {
    addPoint(makePoint({ id: 'a' }))
    addPoint(makePoint({ id: 'b' }))
    expect(removePoint('a').map((p) => p.id)).toEqual(['b'])
  })

  it('persists the removal', () => {
    addPoint(makePoint({ id: 'a' }))
    removePoint('a')
    expect(loadPoints()).toEqual([])
  })

  it('is a no-op for an unknown id', () => {
    addPoint(makePoint({ id: 'a' }))
    expect(removePoint('ghost')).toHaveLength(1)
  })
})
