import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Guards the automatic location request: once per page load, not once per
  // render and not again after each submitted point.
  const autoLocateDone = useRef(false)

  useEffect(() => {
    setContributor(loadContributor())
    setPoints(loadPoints())
  }, [])

  const handlePlace = useCallback(
    (
      latitude: number,
      longitude: number,
      method: PlacementMethod,
      accuracyM: number | null,
    ) => {
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
    },
    [lastYear, lastFloodable],
  )

  const requestLocation = useCallback(
    (auto: boolean) => {
      if (!navigator.geolocation) {
        // An automatic attempt stays silent: the contributor did not ask, and
        // tapping the map still works.
        if (!auto) setStatus('This browser cannot report your location.')
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
        () =>
          setStatus(
            auto
              ? 'Location is unavailable — tap the map to place a point instead.'
              : 'Could not get your location. Check location permissions.',
          ),
        { enableHighAccuracy: true, timeout: 15000 },
      )
    },
    [handlePlace],
  )

  // The phone is the field device, so ask for location the moment there is a
  // map to put it on. On a granted-permission return visit this drops the pin
  // where the contributor is standing with no taps at all.
  useEffect(() => {
    if (!contributor || editingIdentity || autoLocateDone.current) return
    autoLocateDone.current = true
    requestLocation(true)
  }, [contributor, editingIdentity, requestLocation])

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
            <button type="button" onClick={() => requestLocation(false)}>
              Use my location
            </button>
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

          {/*
            Below the form on purpose. On a phone the common path is location
            or a map tap; coordinates and place search are the fallbacks and
            would otherwise push the actual questions off the first screen.
          */}
          <section className="placement-extras">
            <h2>Other ways to place a point</h2>
            <CoordinateInput
              onPlace={(lat, lng) => handlePlace(lat, lng, 'coordinates', null)}
            />
            <PlaceSearch onPlace={(lat, lng) => handlePlace(lat, lng, 'search', null)} />
          </section>

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
