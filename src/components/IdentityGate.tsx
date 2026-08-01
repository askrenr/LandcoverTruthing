import { useState } from 'react'
import type { ContributorInfo } from '../types'
import { validateContributor } from '../lib/validation'

interface Props {
  initial: ContributorInfo | null
  onSave: (info: ContributorInfo) => void
  /** Supplied only when editing existing info; its presence renders Cancel. */
  onCancel?: () => void
}

export default function IdentityGate({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = onCancel !== undefined

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const info = { name: name.trim(), email: email.trim() }
    const result = validateContributor(info)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSave(info)
  }

  return (
    <div className="identity-gate">
      <form className="identity-card" onSubmit={handleSubmit} noValidate>
        <h1>Landcover Truthing</h1>
        <p>
          Help build a training dataset for mapping waterfowl habitat. Drop a pin on a
          field you know, tell us what was planted there and in what year, and submit.
          Only fields you personally know about — no guessing from imagery.
        </p>
        <p className="identity-privacy">
          Your name and email are stored with each point so we can follow up on
          questions. They are not shared or published.
        </p>

        <label htmlFor="contributor-name">Your name</label>
        <input
          id="contributor-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setErrors((prev) => ({ ...prev, name: '' }))
          }}
        />
        {errors.name ? <p className="field-error">{errors.name}</p> : null}

        <label htmlFor="contributor-email">Your email</label>
        <input
          id="contributor-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setErrors((prev) => ({ ...prev, email: '' }))
          }}
        />
        {errors.email ? <p className="field-error">{errors.email}</p> : null}

        <div className="identity-actions">
          <button type="submit">{isEditing ? 'Save' : 'Start mapping'}</button>
          {isEditing ? (
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
