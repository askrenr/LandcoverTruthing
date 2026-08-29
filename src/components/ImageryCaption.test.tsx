import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapContainer, useMap } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import ImageryCaption from './ImageryCaption'

const fetchImagerySource = vi.hoisted(() => vi.fn())
vi.mock('../lib/imagery', async () => {
  const actual = await vi.importActual<typeof import('../lib/imagery')>('../lib/imagery')
  return { ...actual, fetchImagerySource }
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  fetchImagerySource.mockReset().mockResolvedValue({
    date: '2025-02-27',
    resolutionM: 0.34,
    source: 'Vantor',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

/** Hands the test the Leaflet map so it can raise real map events. */
function MapGrabber({ onMap }: { onMap: (map: LeafletMap) => void }) {
  onMap(useMap())
  return null
}

function renderCaption() {
  return render(
    <MapContainer center={[34.5, -91]} zoom={16}>
      <ImageryCaption />
    </MapContainer>,
  )
}

/** The debounce holds the lookup back until the map has settled. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(600)
  })
}

describe('ImageryCaption', () => {
  it('captions the map with the capture date of the imagery beneath it', async () => {
    renderCaption()
    await settle()
    await waitFor(() =>
      expect(screen.getByText('27 Feb 2025 · 0.3 m · Vantor')).toBeInTheDocument(),
    )
    expect(screen.getByText(/imagery at map centre/i)).toBeInTheDocument()
  })

  it('looks up the centre and zoom the contributor is actually looking at', async () => {
    renderCaption()
    await settle()
    const [lat, lng, zoom] = fetchImagerySource.mock.calls[0]
    expect(lat).toBeCloseTo(34.5, 3)
    expect(lng).toBeCloseTo(-91, 3)
    expect(zoom).toBe(16)
  })

  it('waits for the map to settle instead of firing on every pan frame', () => {
    renderCaption()
    expect(fetchImagerySource).not.toHaveBeenCalled()
  })

  it('asks the contributor to zoom in when no footprint covers the view', async () => {
    fetchImagerySource.mockResolvedValue(null)
    renderCaption()
    await settle()
    await waitFor(() =>
      expect(screen.getByText(/zoom in for the imagery date/i)).toBeInTheDocument(),
    )
  })

  it('says nothing over a basemap that has no capture date', async () => {
    let map: LeafletMap | null = null
    render(
      <MapContainer center={[34.5, -91]} zoom={16}>
        <ImageryCaption />
        <MapGrabber onMap={(instance) => (map = instance)} />
      </MapContainer>,
    )
    await settle()
    await waitFor(() =>
      expect(screen.getByText(/imagery at map centre/i)).toBeInTheDocument(),
    )

    // What the layers control raises when the contributor picks Streets.
    await act(async () => {
      map?.fire('baselayerchange', { name: 'Streets' })
    })
    expect(screen.queryByText(/imagery at map centre/i)).not.toBeInTheDocument()

    await act(async () => {
      map?.fire('baselayerchange', { name: 'Imagery' })
    })
    await settle()
    await waitFor(() =>
      expect(screen.getByText(/imagery at map centre/i)).toBeInTheDocument(),
    )
  })
})
