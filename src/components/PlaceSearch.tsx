import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceResult } from '../lib/geocode'

interface Props {
  onPlace: (latitude: number, longitude: number) => void
}

/** Nominatim's usage policy is about one request per second. */
const DEBOUNCE_MS = 600

export default function PlaceSearch({ onPlace }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setSearching(true)
      const found = await searchPlaces(query, controller.signal)
      setSearching(false)
      setResults(found)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="place-search">
      <label htmlFor="place-query">Search for a place</label>
      <input
        id="place-query"
        type="search"
        placeholder="Stuttgart, Arkansas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {searching ? <p className="place-search-status">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="place-search-results">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude},${result.label}`}>
              <button
                type="button"
                onClick={() => {
                  onPlace(result.latitude, result.longitude)
                  setResults([])
                  setQuery('')
                }}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="attribution">Search by OpenStreetMap Nominatim</p>
    </div>
  )
}
