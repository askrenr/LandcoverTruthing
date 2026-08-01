import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoordinateInput from './CoordinateInput'

describe('CoordinateInput', () => {
  it('places a point from decimal degrees', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), '34.5, -91.0')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).toHaveBeenCalledWith(34.5, -91.0)
  })

  it('places a point from DMS', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), `34°30'00"N 91°00'00"W`)
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).toHaveBeenCalled()
    const [lat, lng] = onPlace.mock.calls[0]
    expect(lat).toBeCloseTo(34.5, 5)
    expect(lng).toBeCloseTo(-91.0, 5)
  })

  it('shows an error for unparseable input and does not place', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), 'somewhere')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(onPlace).not.toHaveBeenCalled()
    expect(screen.getByText(/could not read/i)).toBeInTheDocument()
  })

  it('clears the error once the input becomes valid', async () => {
    render(<CoordinateInput onPlace={vi.fn()} />)
    const input = screen.getByLabelText(/coordinates/i)
    await userEvent.type(input, 'nope')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(screen.getByText(/could not read/i)).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '34.5, -91.0')
    expect(screen.queryByText(/could not read/i)).not.toBeInTheDocument()
  })

  it('submits on Enter', async () => {
    const onPlace = vi.fn()
    render(<CoordinateInput onPlace={onPlace} />)
    await userEvent.type(screen.getByLabelText(/coordinates/i), '34.5, -91.0{Enter}')
    expect(onPlace).toHaveBeenCalledWith(34.5, -91.0)
  })

  it('sets aria-invalid and aria-describedby on the input when the error is present', async () => {
    render(<CoordinateInput onPlace={vi.fn()} />)
    const input = screen.getByLabelText(/coordinates/i)
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')

    await userEvent.type(input, 'nope')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))

    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const errorEl = screen.getByRole('alert')
    expect(errorEl).toHaveAttribute('id', describedBy)
  })

  it('omits aria-invalid and aria-describedby once the error clears', async () => {
    render(<CoordinateInput onPlace={vi.fn()} />)
    const input = screen.getByLabelText(/coordinates/i)
    await userEvent.type(input, 'nope')
    await userEvent.click(screen.getByRole('button', { name: /go/i }))
    expect(input).toHaveAttribute('aria-invalid', 'true')

    await userEvent.clear(input)
    await userEvent.type(input, '34.5, -91.0')

    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
