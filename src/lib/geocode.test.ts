import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from './geocode'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('searchPlaces', () => {
  it('returns an empty list for a blank query without calling the network', async () => {
    const fetchMock = stubFetch([])
    expect(await searchPlaces('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty list for a one-character query', async () => {
    const fetchMock = stubFetch([])
    expect(await searchPlaces('s')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps Nominatim results into label and coordinates', async () => {
    stubFetch([
      { display_name: 'Stuttgart, Arkansas', lat: '34.5', lon: '-91.55' },
      { display_name: 'Bayou Meto WMA', lat: '34.3', lon: '-91.7' },
    ])
    const results = await searchPlaces('stuttgart')
    expect(results).toEqual([
      { label: 'Stuttgart, Arkansas', latitude: 34.5, longitude: -91.55 },
      { label: 'Bayou Meto WMA', latitude: 34.3, longitude: -91.7 },
    ])
  })

  it('requests JSON format with a result limit', async () => {
    const fetchMock = stubFetch([])
    await searchPlaces('stuttgart')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('format=json')
    expect(url).toContain('limit=')
  })

  it('url-encodes the query', async () => {
    const fetchMock = stubFetch([])
    await searchPlaces('bayou meto & rice')
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent('bayou meto & rice'),
    )
  })

  it('drops results with unparseable coordinates', async () => {
    stubFetch([
      { display_name: 'Good', lat: '34.5', lon: '-91.55' },
      { display_name: 'Bad', lat: 'nonsense', lon: '-91.7' },
    ])
    const results = await searchPlaces('xy')
    expect(results).toHaveLength(1)
    expect(results[0].label).toBe('Good')
  })

  it('returns an empty list when the service errors', async () => {
    stubFetch([], false)
    expect(await searchPlaces('stuttgart')).toEqual([])
  })

  it('returns an empty list when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await searchPlaces('stuttgart')).toEqual([])
  })

  it('returns an empty list when the payload is not an array', async () => {
    stubFetch({ error: 'rate limited' })
    expect(await searchPlaces('stuttgart')).toEqual([])
  })
})
