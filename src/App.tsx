import { useEffect, useState } from 'react'
import Header from './components/Header'
import IdentityGate from './components/IdentityGate'
import MapPanel from './components/MapPanel'
import PointForm from './components/PointForm'
import SessionList from './components/SessionList'
import CoordinateInput from './components/CoordinateInput'
import PlaceSearch from './components/PlaceSearch'
import type { ContributorInfo, PlacementMethod, PointDraft, StoredPoint } from './types'
import { draftToStoredPoint, emptyDraft, storedPointToDraft } from './lib/points'
import {
  addPoint,
  getSessionToken,
  loadContributor,
  loadPoints,
  newId,
  removePoint,
  saveContributor,
  updatePoint,
} from './lib/storage'
import { deletePointRemote, savePointRemote } from './lib/supabaseClient'

export default function App() {
  const [contributor, setContributor] = useState<ContributorInfo | null>(null)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [points, setPoints] = useState<StoredPoint[]>([])
  const [draft, setDraft] = useState<PointDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Carried forward between points: contributors work one year at a time.
  const [lastYear, setLastYear] = useState<number | null>(null)
  const [lastFloodable, setLastFloodable] = useState<PointDraft['floodable']>('unknown')

  useEffect(() => {
    setContributor(loadContributor())
    setPoints(loadPoints())
  }, [])

  function handlePlace(
    latitude: number,
    longitude: number,
    method: PlacementMethod,
    accuracyM: number | null,
  ) {
    setFocus({ lat: latitude, lng: longitude })
    setDraft((current) =>
      current
        ? { ...current, latitude, longitude, placementMethod: method, gpsAccuracyM: accuracyM }
        : {
            ...emptyDraft(latitude, longitude, method, accuracyM),
            year: lastYear,
            floodable: lastFloodable,
          },
    )
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setStatus('This browser cannot report your location.')
      return
    }
    setStatus('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('')
        handlePlace(
          position.coords.latitude,
          position.coords.longitude,
          'device_gps',
          position.coords.accuracy ?? null,
        )
      },
      () => setStatus('Could not get your location. Check location permissions.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function handleSubmit() {
    if (!draft || !contributor || submitting) return
    const now = new Date().toISOString()
    const existing = editingId ? points.find((p) => p.id === editingId) : undefined
    const point = {
      ...draftToStoredPoint(
        draft,
        contributor,
        getSessionToken(),
        editingId ?? newId(),
        now,
      ),
      createdAt: existing?.createdAt ?? now,
    }

    setSubmitting(true)
    setStatus('Saving…')
    try {
      await savePointRemote(point)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Your point could not be saved.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)

    setPoints(editingId ? updatePoint(point) : addPoint(point))
    setStatus(editingId ? 'Point updated.' : 'Point submitted.')
    setEditingId(null)
    setLastYear(draft.year)
    setLastFloodable(draft.floodable)
    setDraft(null)
  }

  function handleEdit(point: StoredPoint) {
    setEditingId(point.id)
    setDraft(storedPointToDraft(point))
    setFocus({ lat: point.latitude, lng: point.longitude })
  }

  async function handleDelete(id: string) {
    setStatus('Deleting…')
    try {
      await deletePointRemote(id)
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'That point could not be deleted.',
      )
      return
    }
    setPoints(removePoint(id))
    if (editingId === id) {
      setEditingId(null)
      setDraft(null)
    }
    setStatus('Point deleted.')
  }

  function handleCancel() {
    setDraft(null)
    setEditingId(null)
  }

  if (!contributor || editingIdentity) {
    return (
      <IdentityGate
        initial={contributor}
        onSave={(info) => {
          saveContributor(info)
          setContributor(info)
          setEditingIdentity(false)
        }}
        onCancel={contributor ? () => setEditingIdentity(false) : undefined}
      />
    )
  }

  return (
    <div className="app">
      <Header contributor={contributor} onEdit={() => setEditingIdentity(true)} />

      <main className="app-body">
        <MapPanel
          draftPosition={draft ? { lat: draft.latitude, lng: draft.longitude } : null}
          points={points}
          focus={focus}
          onPlace={handlePlace}
        />

        <aside className="app-sidebar">
          <div className="placement-tools">
            <button type="button" onClick={handleUseMyLocation}>
              Use my location
            </button>
            <CoordinateInput
              onPlace={(lat, lng) => handlePlace(lat, lng, 'coordinates', null)}
            />
            <PlaceSearch onPlace={(lat, lng) => handlePlace(lat, lng, 'search', null)} />
          </div>

          {status ? (
            <p className="app-status" role="status">
              {status}
            </p>
          ) : null}

          <PointForm
            draft={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditing={editingId !== null}
          />

          <SessionList
            points={points}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSelect={(point) => setFocus({ lat: point.latitude, lng: point.longitude })}
          />
        </aside>
      </main>
    </div>
  )
}
