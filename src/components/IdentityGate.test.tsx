import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import IdentityGate from './IdentityGate'

describe('IdentityGate', () => {
  it('explains what the project is asking for', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/landcover/i)).toBeInTheDocument()
  })

  it('renders empty name and email fields on first visit', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/name/i)).toHaveValue('')
    expect(screen.getByLabelText(/email/i)).toHaveValue('')
  })

  it('prefills the fields when editing existing info', () => {
    render(
      <IdentityGate
        initial={{ name: 'Ryan Askren', email: 'ryanaskren@gmail.com' }}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/name/i)).toHaveValue('Ryan Askren')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ryanaskren@gmail.com')
  })

  it('calls onSave with trimmed values', async () => {
    const onSave = vi.fn()
    render(<IdentityGate initial={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(/name/i), '  Ryan Askren  ')
    await userEvent.type(screen.getByLabelText(/email/i), ' ryanaskren@gmail.com ')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Ryan Askren',
      email: 'ryanaskren@gmail.com',
    })
  })

  it('does not call onSave when the name is missing', async () => {
    const onSave = vi.fn()
    render(<IdentityGate initial={null} onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(/email/i), 'ryanaskren@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows a validation message for a malformed email', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(screen.getByText(/does not look like an email/i)).toBeInTheDocument()
  })

  it('clears the error once the input is corrected', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))
    expect(screen.getByText(/does not look like an email/i)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/email/i))
    await userEvent.type(screen.getByLabelText(/email/i), 'ryan@example.com')
    expect(screen.queryByText(/does not look like an email/i)).not.toBeInTheDocument()
  })

  it('tells the contributor their email is not published', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.getByText(/not.*(shared|published|public)/i)).toBeInTheDocument()
  })

  it('shows no Cancel button on first visit', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('shows a Cancel button when editing, and calls onCancel', async () => {
    const onCancel = vi.fn()
    render(
      <IdentityGate
        initial={{ name: 'Ryan', email: 'ryan@example.com' }}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('marks an errored field aria-invalid and describes it via the visible error', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))

    const emailInput = screen.getByLabelText(/email/i)
    const errorMessage = screen.getByText(/does not look like an email/i)

    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput).toHaveAttribute('aria-describedby', errorMessage.id)
    expect(emailInput).toHaveAccessibleDescription(/does not look like an email/i)
  })

  it('gives the error message role="alert" so it is announced', async () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Ryan')
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /start|save/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/does not look like an email/i)
  })

  it('leaves a clean field free of aria-invalid and aria-describedby', () => {
    render(<IdentityGate initial={null} onSave={vi.fn()} />)
    const nameInput = screen.getByLabelText(/name/i)
    const emailInput = screen.getByLabelText(/email/i)

    expect(nameInput).not.toHaveAttribute('aria-invalid')
    expect(nameInput).not.toHaveAttribute('aria-describedby')
    expect(emailInput).not.toHaveAttribute('aria-invalid')
    expect(emailInput).not.toHaveAttribute('aria-describedby')
  })
})
