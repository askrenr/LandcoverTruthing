import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadPoints } from './lib/storage'

vi.mock('./components/MapPanel', () => ({
  default: ({ onPlace }: { onPlace: (a: number, b: number, c: string, d: null) => void }) => (
    <button type="button" onClick={() => onPlace(34.5, -91.0, 'map_click', null)}>
      simulate map click
    </button>
  ),
}))

beforeEach(() => {
  localStorage.clear()
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
