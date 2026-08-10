import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredPoint } from '../types'
import SessionList from './SessionList'

const downloadCsv = vi.hoisted(() => vi.fn())
vi.mock('../lib/csv', async () => {
  const actual = await vi.importActual<typeof import('../lib/csv')>('../lib/csv')
  return { ...actual, downloadCsv }
})

function makePoint(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    sessionToken: 'token',
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
    ...overrides,
  }
}

beforeEach(() => {
  downloadCsv.mockClear()
})

describe('SessionList — empty', () => {
  it('says nothing has been submitted yet', () => {
    render(
      <SessionList points={[]} onEdit={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />,
    )
    expect(screen.getByText(/no points yet/i)).toBeInTheDocument()
  })

  it('disables the download button', () => {
    render(
      <SessionList points={[]} onEdit={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })
})

describe('SessionList — with points', () => {
  it('shows a count', () => {
    render(
      <SessionList
        points={[makePoint({ id: 'a' }), makePoint({ id: 'b' })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 points/i)).toBeInTheDocument()
  })

  it('uses the singular for one point', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 point\b/i)).toBeInTheDocument()
  })

  it('shows the class and year of each point', () => {
    render(
      <SessionList
        points={[makePoint({ landcoverClass: 'rice/dirty', year: 2022 })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/rice\/dirty/)).toBeInTheDocument()
    expect(screen.getByText(/2022/)).toBeInTheDocument()
  })

  it('shows the free text instead of "other" for an other-class point', () => {
    render(
      <SessionList
        points={[makePoint({ landcoverClass: 'other', classOther: 'buckwheat' })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/buckwheat/)).toBeInTheDocument()
  })

  it('shows the coordinates of each point', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/34\.500000, -91\.000000/)).toBeInTheDocument()
  })

  it('calls onEdit for the chosen point', async () => {
    const onEdit = vi.fn()
    const point = makePoint()
    render(
      <SessionList
        points={[point]}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onEdit).toHaveBeenCalledWith(point)
  })

  it('calls onSelect when the point summary is clicked, to recenter the map', async () => {
    const onSelect = vi.fn()
    const point = makePoint()
    render(
      <SessionList
        points={[point]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={onSelect}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /show on map/i }))
    expect(onSelect).toHaveBeenCalledWith(point)
  })
})

describe('SessionList — delete confirmation', () => {
  it('does not delete on the first click', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes after the confirmation is clicked', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint({ id: 'doomed' })]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledWith('doomed')
  })

  it('can be backed out of', async () => {
    const onDelete = vi.fn()
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })
})

describe('SessionList — CSV download', () => {
  it('downloads the points as CSV', async () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /download/i }))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toMatch(/\.csv$/)
    expect(csv).toContain('landcover_class')
  })

  it('warns that the local list is per-browser', () => {
    render(
      <SessionList
        points={[makePoint()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/this browser/i)).toBeInTheDocument()
  })
})
