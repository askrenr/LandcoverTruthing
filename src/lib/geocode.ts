/**
 * Place search via OSM Nominatim.
 *
 * Nominatim's usage policy caps this at roughly one request per second, so the
 * caller must debounce. Every failure mode returns an empty list rather than
 * throwing — a search box that explodes on a flaky network is worse than one
 * that finds nothing.
 */

export interface PlaceResult {
  label: string
  latitude: number
  longitude: number
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 5

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  const url = `${ENDPOINT}?format=json&limit=${RESULT_LIMIT}&q=${encodeURIComponent(trimmed)}`

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return []
    const payload = await response.json()
    if (!Array.isArray(payload)) return []

    return payload
      .map((item: { display_name?: string; lat?: string; lon?: string }) => ({
        label: String(item.display_name ?? ''),
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }))
      .filter(
        (result) =>
          result.label.length > 0 &&
          Number.isFinite(result.latitude) &&
          Number.isFinite(result.longitude),
      )
  } catch {
    return []
  }
}
