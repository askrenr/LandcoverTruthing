import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  LayersControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { DEFAULT_MAP_VIEW } from '../config'
import type { PlacementMethod, StoredPoint } from '../types'

interface Props {
  draftPosition: { lat: number; lng: number } | null
  points: StoredPoint[]
  focus: { lat: number; lng: number } | null
  onPlace: (
    latitude: number,
    longitude: number,
    method: PlacementMethod,
    accuracyM: number | null,
  ) => void
}

function pinIcon(color: string) {
  return L.divIcon({
    className: 'map-pin',
    html: `<svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22c0-6.6-5.4-12-12-12z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
  })
}

const DRAFT_ICON = pinIcon('#d94801')
const SUBMITTED_ICON = pinIcon('#2b6cb0')

function ClickHandler({ onPlace }: Pick<Props, 'onPlace'>) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng, 'map_click', null)
    },
  })
  return null
}

function FocusController({ focus }: Pick<Props, 'focus'>) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 13))
  }, [focus, map])
  return null
}

export default function MapPanel({ draftPosition, points, focus, onPlace }: Props) {
  return (
    <div className="map-panel">
      <MapContainer
        center={[DEFAULT_MAP_VIEW.lat, DEFAULT_MAP_VIEW.lng]}
        zoom={DEFAULT_MAP_VIEW.zoom}
        className="map-container"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Imagery">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Streets">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Place labels">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.Overlay>
        </LayersControl>

        <ClickHandler onPlace={onPlace} />
        <FocusController focus={focus} />

        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={SUBMITTED_ICON}
          />
        ))}

        {draftPosition ? (
          <Marker
            position={[draftPosition.lat, draftPosition.lng]}
            icon={DRAFT_ICON}
            draggable
            eventHandlers={{
              dragend(event) {
                const { lat, lng } = (event.target as L.Marker).getLatLng()
                onPlace(lat, lng, 'map_click', null)
              },
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  )
}
