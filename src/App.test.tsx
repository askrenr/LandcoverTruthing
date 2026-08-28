import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadPoints, saveContributor } from './lib/storage'
import type { StoredPoint } from './types'

vi.mock('./components/MapPanel', () => ({
  default: ({ onPlace }: { onPlace: (a: number, b: number, c: string, d: null) => void }) => (
    <button type="button" onClick={() => onPlace(34.5, -91.0, 'map_click', null)}>
      simulate map click
    </button>
  ),
}))

const savePointRemote = vi.hoisted(() => vi.fn())
const deletePointRemote = vi.hoisted(() => vi.fn())
vi.mock('./lib/supabaseClient', () => ({
  isBackendConfigured: () => true,
  savePointRemote,
  deletePointRemote,
}))

beforeEach(() => {
  localStorage.clear()
  savePointRemote.mockReset().mockResolvedValue(undefined)
  deletePointRemote.mockReset().mockResolvedValue(undefined)
})

async function signIn() {
  await userEvent.type(screen.getByLabelText(/name/i), 'Ryan Askren')
  await userEvent.type(screen.getByLabelText(/email/i), 'ryanaskren@gmail.com')
  await userEvent.click(screen.getByRole('button', { name: /start mapping/i }))
}

async function submitPoint(landcoverClass: string, year: string) {
  await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
  await userEvent.selectOptions(screen.getByLabelText(/landcover/i), landcoverClass)
  await userEvent.selectOptions(screen.getByLabelText(/year/i), year)
  await userEvent.click(screen.getByRole('button', { name: /submit point/i }))
}

describe('App — identity gate', () => {
  it('shows the identity gate on first visit', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /start mapping/i })).toBeInTheDocument()
  })

  it('shows the map once identity is provided', async () => {
    render(<App />)
    await signIn()
    expect(screen.getByRole('button', { name: /simulate map click/i })).toBeInTheDocument()
  })

  it('skips the gate on a return visit', async () => {
    const { unmount } = render(<App />)
    await signIn()
    unmount()

    render(<App />)
    expect(screen.queryByRole('button', { name: /start mapping/i })).not.toBeInTheDocument()
  })

  it('reopens the gate via "edit my info"', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /edit my info/i }))
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })
})

describe('App — submitting points', () => {
  it('persists a submitted point to local storage', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')

    const stored = loadPoints()
    expect(stored).toHaveLength(1)
    expect(stored[0].landcoverClass).toBe('rice')
    expect(stored[0].year).toBe(2023)
    expect(stored[0].contributorName).toBe('Ryan Askren')
  })

  it('shows the point in the session list', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(screen.getByText(/1 point\b/i)).toBeInTheDocument()
  })

  it('clears class after submit so the next point starts fresh', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('')
  })

  it('retains the year after submit, since people work one year at a time', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2022')
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/year/i)).toHaveValue('2022')
  })

  it('retains floodable after submit', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    await userEvent.selectOptions(screen.getByLabelText(/flooded/i), 'yes')
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice')
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))

    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(screen.getByLabelText(/flooded/i)).toHaveValue('yes')
  })

  it('accumulates multiple points', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await submitPoint('corn', '2022')
    expect(loadPoints()).toHaveLength(2)
    expect(screen.getByText(/2 points/i)).toBeInTheDocument()
  })
})

describe('App — asking for location up front', () => {
  // jsdom has no geolocation at all, so every other test in this file exercises
  // the unsupported-browser path. This block installs one and removes it again.
  const getCurrentPosition = vi.fn()

  beforeEach(() => {
    getCurrentPosition.mockReset()
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  function locateAt(latitude: number, longitude: number, accuracy = 5) {
    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({ coords: { latitude, longitude, accuracy } } as GeolocationPosition),
    )
  }

  it('does not ask while the identity gate is still up', () => {
    render(<App />)
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('asks as soon as the contributor is known', async () => {
    render(<App />)
    await signIn()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('asks on a return visit without waiting for a tap', async () => {
    saveContributor({ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' })
    render(<App />)
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1))
  })

  it('drops the pin where the contributor is standing', async () => {
    locateAt(34.7, -91.2)
    render(<App />)
    await signIn()
    await waitFor(() =>
      expect(screen.getByText(/34\.700000, -91\.200000/)).toBeInTheDocument(),
    )
  })

  it('records the auto-placed point as device GPS with its accuracy', async () => {
    locateAt(34.7, -91.2, 4.7)
    render(<App />)
    await signIn()
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice')
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))

    const stored = loadPoints()
    expect(stored[0].placementMethod).toBe('device_gps')
    expect(stored[0].gpsAccuracyM).toBe(4.7)
  })

  // A fresh prompt after every submitted point would fight a contributor who
  // is working a list of fields from an armchair rather than standing in them.
  it('asks only once per load, not again after a point is submitted', async () => {
    locateAt(34.7, -91.2)
    render(<App />)
    await signIn()
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice')
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('explains the fallback when location is refused', async () => {
    getCurrentPosition.mockImplementation(
      (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    render(<App />)
    await signIn()
    await waitFor(() =>
      expect(screen.getByText(/tap the map to place a point instead/i)).toBeInTheDocument(),
    )
  })

  it('still offers the manual button after refusing', async () => {
    getCurrentPosition.mockImplementation(
      (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })
})

describe('App — sidebar order for one-handed phone entry', () => {
  function isBefore(first: Element, second: Element) {
    return Boolean(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
  }

  it('leads with Submit so it is reachable without scrolling the questions', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    expect(
      isBefore(
        screen.getByRole('button', { name: /submit point/i }),
        screen.getByLabelText(/landcover/i),
      ),
    ).toBe(true)
  })

  it('puts "Use my location" below the questions, with the other placement tools', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    const location = screen.getByRole('button', { name: /use my location/i })
    expect(isBefore(screen.getByLabelText(/notes/i), location)).toBe(true)
    expect(isBefore(location, screen.getByLabelText(/coordinates/i))).toBe(true)
  })

  it('puts coordinates and place search below the last question', async () => {
    render(<App />)
    await signIn()
    await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }))
    const notes = screen.getByLabelText(/notes/i)
    expect(isBefore(notes, screen.getByLabelText(/coordinates/i))).toBe(true)
    expect(isBefore(notes, screen.getByLabelText(/search for a place/i))).toBe(true)
  })

  it('still keeps them above the list of submitted points', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(
      isBefore(
        screen.getByLabelText(/search for a place/i),
        screen.getByText(/1 point\b/i),
      ),
    ).toBe(true)
  })
})

describe('App — malformed stored points', () => {
  it('renders without throwing and shows only the valid point when storage has a null entry', () => {
    saveContributor({ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' })
    const valid: StoredPoint = {
      id: 'good-1',
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
      sessionToken: 'token-1',
      contributorName: 'Ryan Askren',
      contributorEmail: 'ryanaskren@gmail.com',
      latitude: 34.5,
      longitude: -91.0,
      landcoverClass: 'rice',
      classOther: null,
      harvested: 'unknown',
      year: 2023,
      floodable: 'yes',
      confidence: 'certain',
      notes: null,
      placementMethod: 'map_click',
      gpsAccuracyM: null,
    }
    localStorage.setItem('lct.points', JSON.stringify([null, valid]))

    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByText(/1 point\b/i)).toBeInTheDocument()
  })
})

describe('App — editing and deleting', () => {
  it('loads a point back into the form for editing', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('rice')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('writes an edit through to storage without adding a row', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'corn')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const stored = loadPoints()
    expect(stored).toHaveLength(1)
    expect(stored[0].landcoverClass).toBe('corn')
  })

  it('deletes a point after confirmation', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(loadPoints()).toHaveLength(0)
  })
})

describe('App — backend sync', () => {
  it('sends a submitted point to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(savePointRemote).toHaveBeenCalledTimes(1)
    expect(savePointRemote.mock.calls[0][0]).toMatchObject({
      landcoverClass: 'rice',
      year: 2023,
    })
  })

  it('does not store the point locally when the database write fails', async () => {
    savePointRemote.mockRejectedValue(new Error('Your point could not be saved: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(loadPoints()).toHaveLength(0)
  })

  it('shows the failure and keeps the form filled so the contributor can retry', async () => {
    savePointRemote.mockRejectedValue(new Error('Your point could not be saved: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    expect(screen.getByText(/could not be saved/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('rice')
  })

  it('succeeds on retry after a transient failure', async () => {
    savePointRemote
      .mockRejectedValueOnce(new Error('Your point could not be saved: offline'))
      .mockResolvedValue(undefined)
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /submit point/i }))
    expect(loadPoints()).toHaveLength(1)
  })

  it('sends an edit to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'corn')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(savePointRemote).toHaveBeenCalledTimes(2)
    expect(savePointRemote.mock.calls[1][0]).toMatchObject({ landcoverClass: 'corn' })
  })

  it('sends a delete to the database', async () => {
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    const id = loadPoints()[0].id
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(deletePointRemote).toHaveBeenCalledWith(id)
  })

  it('keeps the point locally when the remote delete fails', async () => {
    deletePointRemote.mockRejectedValue(new Error('That point could not be deleted: offline'))
    render(<App />)
    await signIn()
    await submitPoint('rice', '2023')
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(loadPoints()).toHaveLength(1)
    expect(screen.getByText(/could not be deleted/i)).toBeInTheDocument()
  })
})
