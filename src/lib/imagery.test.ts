import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeImagery, fetchImagerySource, formatImageryDate } from './imagery'

afterEach(() => {
  vi.unstubAllGlobals()
})

function result(attributes: Record<string, string>) {
  return { layerId: 0, layerName: 'World Imagery', attributes }
}

/** A high-resolution scene: the tier that draws from zoom 12 up. */
const HIGH_RES = result({
  OBJECTID: '2978738',
  'DATE (YYYYMMDD)': '20250227',
  'RESOLUTION (M)': '0.34',
  SOURCE: 'Vantor',
  MinMapLevel: '12',
  MaxMapLevel: '19',
  DrawOrder: '80',
})

/** The undated 15 m base under it, drawn only when zoomed out. */
const LOW_RES = result({
  OBJECTID: '953396',
  'DATE (YYYYMMDD)': 'Null',
  'RESOLUTION (M)': '15',
  SOURCE: 'Earthstar Geographics',
  MinMapLevel: '0',
  MaxMapLevel: '11',
  DrawOrder: '70',
})

function stubFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => payload })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchImagerySource', () => {
  it('reads the date, resolution, and provider of the scene at the point', async () => {
    stubFetch({ results: [HIGH_RES, LOW_RES] })
    expect(await fetchImagerySource(34.5, -91, 16)).toEqual({
      date: '2025-02-27',
      resolutionM: 0.34,
      source: 'Vantor',
    })
  })

  it('picks the tier that draws at the requested zoom, not the top hit', async () => {
    stubFetch({ results: [HIGH_RES, LOW_RES] })
    const imagery = await fetchImagerySource(34.5, -91, 8)
    expect(imagery).toEqual({
      date: null,
      resolutionM: 15,
      source: 'Earthstar Geographics',
    })
  })

  it('returns null when no footprint claims the zoom', async () => {
    stubFetch({ results: [HIGH_RES] })
    expect(await fetchImagerySource(34.5, -91, 8)).toBeNull()
  })

  it('counts a footprint repeated across resolution tiers once', async () => {
    stubFetch({
      results: [
        HIGH_RES,
        { ...HIGH_RES, layerId: 2 },
        { ...HIGH_RES, layerId: 3 },
      ],
    })
    expect((await fetchImagerySource(34.5, -91, 16))?.date).toBe('2025-02-27')
  })

  it("treats Esri's literal 'Null' as a missing value", async () => {
    stubFetch({
      results: [
        result({
          OBJECTID: '1',
          'DATE (YYYYMMDD)': 'Null',
          'RESOLUTION (M)': 'Null',
          SOURCE: 'Null',
          MinMapLevel: '0',
          MaxMapLevel: '19',
          DrawOrder: '1',
        }),
      ],
    })
    expect(await fetchImagerySource(34.5, -91, 16)).toEqual({
      date: null,
      resolutionM: null,
      source: null,
    })
  })

  it('rejects a date that is not eight digits', async () => {
    stubFetch({
      results: [result({ ...HIGH_RES.attributes, 'DATE (YYYYMMDD)': '2025' })],
    })
    expect((await fetchImagerySource(34.5, -91, 16))?.date).toBeNull()
  })

  it('rejects a date with an impossible month', async () => {
    stubFetch({
      results: [result({ ...HIGH_RES.attributes, 'DATE (YYYYMMDD)': '20251327' })],
    })
    expect((await fetchImagerySource(34.5, -91, 16))?.date).toBeNull()
  })

  it('sends the point as a WGS84 identify query', async () => {
    const fetchMock = stubFetch({ results: [] })
    await fetchImagerySource(34.5, -91, 16)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/identify?')
    expect(url).toContain(encodeURIComponent('"x":-91'))
    expect(url).toContain(encodeURIComponent('"y":34.5'))
    expect(url).toContain('sr=4326')
  })

  it('does not call the network for unusable coordinates', async () => {
    const fetchMock = stubFetch({ results: [HIGH_RES] })
    expect(await fetchImagerySource(Number.NaN, -91, 16)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when the service errors', async () => {
    stubFetch({ results: [HIGH_RES] }, false)
    expect(await fetchImagerySource(34.5, -91, 16)).toBeNull()
  })

  it('returns null when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchImagerySource(34.5, -91, 16)).toBeNull()
  })

  it('returns null when the payload has no results array', async () => {
    stubFetch({ error: { code: 400 } })
    expect(await fetchImagerySource(34.5, -91, 16)).toBeNull()
  })
})

describe('formatImageryDate', () => {
  it('spells the month out so no locale reads it backwards', () => {
    expect(formatImageryDate('2025-02-27')).toBe('27 Feb 2025')
  })

  it('drops the leading zero from the day', () => {
    expect(formatImageryDate('2024-11-03')).toBe('3 Nov 2024')
  })

  it('returns null for a missing or malformed date', () => {
    expect(formatImageryDate(null)).toBeNull()
    expect(formatImageryDate('2025')).toBeNull()
  })
})

describe('describeImagery', () => {
  it('reads date, resolution, then provider', () => {
    expect(
      describeImagery({ date: '2025-02-27', resolutionM: 0.34, source: 'Vantor' }),
    ).toBe('27 Feb 2025 · 0.3 m · Vantor')
  })

  it('rounds resolutions of a metre or more to whole metres', () => {
    expect(
      describeImagery({ date: null, resolutionM: 15, source: 'Earthstar Geographics' }),
    ).toBe('date not published · 15 m · Earthstar Geographics')
  })

  it('says so rather than inventing a date it was not given', () => {
    expect(describeImagery({ date: null, resolutionM: null, source: null })).toBe(
      'date not published',
    )
  })

  it('has nothing to say when there is no imagery', () => {
    expect(describeImagery(null)).toBeNull()
  })
})
