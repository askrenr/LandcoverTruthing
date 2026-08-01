import { useState } from 'react'
import type { StoredPoint } from '../types'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatCoordinates } from '../lib/coordinates'

interface Props {
  points: StoredPoint[]
  onEdit: (point: StoredPoint) => void
  onDelete: (id: string) => void
  onSelect: (point: StoredPoint) => void
}

function describeClass(point: StoredPoint): string {
  return point.landcoverClass === 'other' && point.classOther
    ? point.classOther
    : point.landcoverClass
}

export default function SessionList({ points, onEdit, onDelete, onSelect }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  function handleDownload() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`landcover-points-${stamp}.csv`, toCsv(points))
  }

  return (
    <section className="session-list">
      <div className="session-list-header">
        <h2>Your points</h2>
        <span>
          {points.length} {points.length === 1 ? 'point' : 'points'}
        </span>
      </div>

      {points.length === 0 ? (
        <p className="session-list-empty">No points yet — submit one to see it here.</p>
      ) : (
        <ul>
          {points.map((point) => (
            <li key={point.id}>
              <button
                type="button"
                className="session-point-summary"
                onClick={() => onSelect(point)}
                aria-label={`Show on map: ${describeClass(point)} ${point.year}`}
              >
                <strong>{describeClass(point)}</strong>
                <span>{point.year}</span>
                <span className="session-point-coords">
                  {formatCoordinates(point.latitude, point.longitude)}
                </span>
              </button>

              {pendingDelete === point.id ? (
                <div className="session-point-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(point.id)
                      setPendingDelete(null)
                    }}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPendingDelete(null)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="session-point-actions">
                  <button type="button" onClick={() => onEdit(point)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPendingDelete(point.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={handleDownload} disabled={points.length === 0}>
        Download my points (CSV)
      </button>
      <p className="session-list-note">
        This list is saved in this browser only. Your submitted points are safe in the
        project database either way, but clearing your browser data will empty this list.
      </p>
    </section>
  )
}
