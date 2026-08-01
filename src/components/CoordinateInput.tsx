import { useState } from 'react'
import { parseCoordinates } from '../lib/coordinates'

interface Props {
  onPlace: (latitude: number, longitude: number) => void
}

const ERROR_ID = 'coordinate-input-error'

export default function CoordinateInput({ onPlace }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseCoordinates(text)
    if (!parsed) {
      setError('Could not read those coordinates. Try "34.5, -91.0".')
      return
    }
    setError('')
    onPlace(parsed.latitude, parsed.longitude)
  }

  return (
    <form className="coordinate-input" onSubmit={handleSubmit}>
      <label htmlFor="coordinate-text">Coordinates</label>
      <div className="input-row">
        <input
          id="coordinate-text"
          type="text"
          placeholder="34.5, -91.0"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
        />
        <button type="submit">Go</button>
      </div>
      {error ? (
        <p id={ERROR_ID} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
