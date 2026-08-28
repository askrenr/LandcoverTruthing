import {
  CONFIDENCE_OPTIONS,
  FLOODABLE_OPTIONS,
  HARVESTED_OPTIONS,
  LANDCOVER_CLASSES,
  NOTES_MAX_LENGTH,
  OTHER_CLASS,
  availableYears,
  isAgClass,
} from '../config'
import type { LandcoverClass, PointDraft } from '../types'
import { formatCoordinates } from '../lib/coordinates'
import { firstError, validateDraft } from '../lib/validation'

interface Props {
  draft: PointDraft | null
  onChange: (draft: PointDraft) => void
  onSubmit: () => void
  onCancel: () => void
  isEditing: boolean
}

export default function PointForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
}: Props) {
  if (!draft) {
    return (
      <div className="point-form point-form-empty">
        <p>
          Place a point to get started — tap the map or use your location.
          Coordinates and place search are at the bottom of this panel.
        </p>
      </div>
    )
  }

  const result = validateDraft(draft)
  const blockingReason = firstError(result)
  const blockedId = 'point-form-blocked'

  function update(patch: Partial<PointDraft>) {
    onChange({ ...draft!, ...patch })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (result.valid) onSubmit()
  }

  return (
    <form className="point-form" onSubmit={handleSubmit}>
      {blockingReason ? (
        <p id={blockedId} className="form-blocked" role="alert">
          {blockingReason}
        </p>
      ) : null}

      <div className="point-form-actions">
        <button
          type="submit"
          disabled={!result.valid}
          aria-describedby={blockingReason ? blockedId : undefined}
        >
          {isEditing ? 'Save changes' : 'Submit point'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p className="point-coordinates">
        {formatCoordinates(draft.latitude, draft.longitude)}
      </p>

      <label htmlFor="landcover-class">Landcover class</label>
      <select
        id="landcover-class"
        value={draft.landcoverClass ?? ''}
        onChange={(event) =>
          update({
            landcoverClass: (event.target.value || null) as LandcoverClass | null,
            // Drop stale free text when moving away from "other".
            classOther: event.target.value === OTHER_CLASS ? draft.classOther : '',
            // Likewise a stale harvest answer when moving to a class that
            // cannot be harvested, so the hidden field never submits a "yes".
            harvested: isAgClass(event.target.value) ? draft.harvested : 'unknown',
          })
        }
      >
        <option value="">Choose one…</option>
        {LANDCOVER_CLASSES.map((className) => (
          <option key={className} value={className}>
            {className}
          </option>
        ))}
      </select>

      {draft.landcoverClass === OTHER_CLASS ? (
        <>
          <label htmlFor="class-other">Describe the landcover</label>
          <input
            id="class-other"
            type="text"
            value={draft.classOther}
            onChange={(event) => update({ classOther: event.target.value })}
          />
        </>
      ) : null}

      {isAgClass(draft.landcoverClass) ? (
        <>
          <label htmlFor="point-harvested">Was the crop harvested?</label>
          <select
            id="point-harvested"
            value={draft.harvested}
            onChange={(event) =>
              update({ harvested: event.target.value as PointDraft['harvested'] })
            }
          >
            {HARVESTED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {/*
        "observed" rather than "planted": the natural wetland vegetation classes
        (willow, buttonbush, floating leaf, persistent emergent) were never
        planted in a given year, so a planting-year framing has no answer there.
      */}
      <label htmlFor="point-year">Year observed</label>
      <select
        id="point-year"
        value={draft.year === null ? '' : String(draft.year)}
        onChange={(event) =>
          update({ year: event.target.value ? Number(event.target.value) : null })
        }
      >
        <option value="">Choose one…</option>
        {availableYears().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <label htmlFor="point-floodable">Can this ground be flooded?</label>
      <select
        id="point-floodable"
        value={draft.floodable}
        onChange={(event) =>
          update({ floodable: event.target.value as PointDraft['floodable'] })
        }
      >
        {FLOODABLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="point-confidence">How confident are you?</label>
      <select
        id="point-confidence"
        value={draft.confidence}
        onChange={(event) =>
          update({ confidence: event.target.value as PointDraft['confidence'] })
        }
      >
        {CONFIDENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="point-notes">Notes (optional)</label>
      <textarea
        id="point-notes"
        rows={3}
        maxLength={NOTES_MAX_LENGTH}
        value={draft.notes}
        onChange={(event) => update({ notes: event.target.value })}
      />
    </form>
  )
}
