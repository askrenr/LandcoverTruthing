import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import { describeImagery, fetchImagerySource } from '../lib/imagery'

/** The basemap this caption describes; the others carry no capture date. */
const IMAGERY_LAYER_NAME = 'Imagery'

/** Long enough that a pinch-zoom across the state is one lookup, not thirty. */
const DEBOUNCE_MS = 500

/**
 * Shows when the aerial imagery under the middle of the map was flown.
 *
 * Contributors label what was growing in a given year from what they can see,
 * so the age of the picture decides whether they can answer at all — a 2019
 * scene cannot show a 2024 crop. The footprints are per-scene, so this reports
 * the map centre, not the whole frame; panning across a seam changes it.
 */
export default function ImageryCaption() {
  const map = useMap()
  const [caption, setCaption] = useState<string | null>(null)
  const [showing, setShowing] = useState(true)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  // Only the newest lookup may write; a slow early response must not overwrite
  // the answer for where the map ended up.
  const requestRef = useRef(0)
  const [pending, setPending] = useState(0)

  useMapEvents({
    moveend: () => setPending((n) => n + 1),
    baselayerchange: (event) => setShowing(event.name === IMAGERY_LAYER_NAME),
  })

  // A click meant for the caption is not a click meant to place a point.
  useEffect(() => {
    if (boxRef.current) L.DomEvent.disableClickPropagation(boxRef.current)
  }, [showing])

  useEffect(() => {
    if (!showing) return

    const timer = setTimeout(async () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const generation = ++requestRef.current

      const center = map.getCenter()
      const imagery = await fetchImagerySource(
        center.lat,
        center.lng,
        map.getZoom(),
        controller.signal,
      )
      if (generation !== requestRef.current) return
      setCaption(describeImagery(imagery))
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [map, pending, showing])

  useEffect(() => () => controllerRef.current?.abort(), [])

  if (!showing) return null

  return (
    <div className="leaflet-bottom leaflet-left imagery-caption-slot">
      <div ref={boxRef} className="leaflet-control imagery-caption">
        {caption ? (
          <>
            <span className="imagery-caption-label">Imagery at map centre</span>
            <span className="imagery-caption-value">{caption}</span>
          </>
        ) : (
          <span className="imagery-caption-label">
            Zoom in for the imagery date
          </span>
        )}
      </div>
    </div>
  )
}
