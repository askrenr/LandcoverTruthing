import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredPoint } from '../types'

const upsert = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
const eq = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient }))

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: '22222222-2222-4222-8222-222222222222',
    contributorName: 'Ryan Askren',
    contributorEmail: 'ryanaskren@gmail.com',
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: 'rice',
    classOther: null,
    harvested: 'unknown',
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
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  eq.mockResolvedValue({ error: null })
  del.mockReturnValue({ eq })
  upsert.mockResolvedValue({ error: null })
  from.mockReturnValue({ upsert, delete: del })
  createClient.mockReturnValue({ from })
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})

describe('isBackendConfigured', () => {
  it('is true when both env vars are present', async () => {
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(true)
  })

  it('is false when the url is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(false)
  })

  it('is false when the anon key is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const mod = await import('./supabaseClient')
    expect(mod.isBackendConfigured()).toBe(false)
  })
})

describe('savePointRemote', () => {
  it('writes to the landcover_points table', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    expect(from).toHaveBeenCalledWith('landcover_points')
  })

  it('upserts on id so a retry cannot duplicate the row', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'point-1' }),
      { onConflict: 'id' },
    )
  })

  it('sends snake_case column names', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    const [row] = upsert.mock.calls[0]
    expect(row).toHaveProperty('landcover_class', 'rice')
    expect(row).toHaveProperty('placement_method', 'map_click')
    expect(row).not.toHaveProperty('landcoverClass')
  })

  it('sends the session token header so RLS can identify the contributor', async () => {
    const mod = await import('./supabaseClient')
    await mod.savePointRemote(makePoint())
    const options = createClient.mock.calls[0][2]
    expect(options.global.headers).toHaveProperty('x-session-token')
  })

  it('throws a readable error when the write is rejected', async () => {
    upsert.mockResolvedValue({ error: { message: 'new row violates row-level security' } })
    const mod = await import('./supabaseClient')
    await expect(mod.savePointRemote(makePoint())).rejects.toThrow(/could not be saved/i)
  })

  it('throws when the backend is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const mod = await import('./supabaseClient')
    await expect(mod.savePointRemote(makePoint())).rejects.toThrow(/not configured/i)
  })
})

describe('deletePointRemote', () => {
  it('deletes the row by id', async () => {
    const mod = await import('./supabaseClient')
    await mod.deletePointRemote('point-1')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'point-1')
  })

  it('throws a readable error when the delete is rejected', async () => {
    eq.mockResolvedValue({ error: { message: 'permission denied' } })
    const mod = await import('./supabaseClient')
    await expect(mod.deletePointRemote('point-1')).rejects.toThrow(/could not be deleted/i)
  })
})
