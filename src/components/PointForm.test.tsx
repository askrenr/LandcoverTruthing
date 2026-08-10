import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PointDraft } from '../types'
import { LANDCOVER_CLASSES, currentYear } from '../config'
import PointForm from './PointForm'

function makeDraft(overrides: Partial<PointDraft> = {}): PointDraft {
  return {
    latitude: 34.5,
    longitude: -91.0,
    landcoverClass: null,
    classOther: '',
    harvested: 'unknown',
    year: null,
    floodable: 'unknown',
    confidence: 'certain',
    notes: '',
    placementMethod: 'map_click',
    gpsAccuracyM: null,
    ...overrides,
  }
}

function renderForm(draft: PointDraft | null, props: Partial<Record<string, unknown>> = {}) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <PointForm
      draft={draft}
      onChange={onChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isEditing={false}
      {...props}
    />,
  )
  return { onChange, onSubmit, onCancel }
}

describe('PointForm — no point placed', () => {
  it('prompts the contributor to place a point', () => {
    renderForm(null)
    expect(screen.getByText(/place a point/i)).toBeInTheDocument()
  })

  it('does not render the class dropdown', () => {
    renderForm(null)
    expect(screen.queryByLabelText(/landcover/i)).not.toBeInTheDocument()
  })
})

describe('PointForm — fields', () => {
  it('shows the placed coordinates', () => {
    renderForm(makeDraft())
    expect(screen.getByText(/34\.500000, -91\.000000/)).toBeInTheDocument()
  })

  it('starts with no class selected', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/landcover/i)).toHaveValue('')
  })

  it('starts with no year selected', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/year/i)).toHaveValue('')
  })

  // Derived from the config rather than hardcoded: config.test.ts already pins
  // the exact class list, so duplicating the count here only adds a second
  // place to edit every time a class is added.
  it('lists every configured class plus the placeholder', () => {
    renderForm(makeDraft())
    const select = screen.getByLabelText(/landcover/i)
    expect(select.querySelectorAll('option')).toHaveLength(LANDCOVER_CLASSES.length + 1)
  })

  it('lists years newest first starting at the current year', () => {
    renderForm(makeDraft())
    const options = screen.getByLabelText(/year/i).querySelectorAll('option')
    expect(options[1].textContent).toBe(String(currentYear()))
  })

  it('does not offer any year before 2020', () => {
    renderForm(makeDraft())
    const values = Array.from(
      screen.getByLabelText(/year/i).querySelectorAll('option'),
    ).map((option) => option.getAttribute('value'))
    expect(values).not.toContain('2019')
  })

  it('defaults floodable to unknown', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/flooded/i)).toHaveValue('unknown')
  })

  it('defaults confidence to certain', () => {
    renderForm(makeDraft())
    expect(screen.getByLabelText(/confident/i)).toHaveValue('certain')
  })
})

describe('PointForm — the "other" free-text box', () => {
  it('is absent for an ordinary class', () => {
    renderForm(makeDraft({ landcoverClass: 'rice' }))
    expect(screen.queryByLabelText(/describe/i)).not.toBeInTheDocument()
  })

  it('appears when the class is "other"', () => {
    renderForm(makeDraft({ landcoverClass: 'other' }))
    expect(screen.getByLabelText(/describe/i)).toBeInTheDocument()
  })
})

describe('PointForm — the harvested question', () => {
  it('is absent until a class is chosen', () => {
    renderForm(makeDraft())
    expect(screen.queryByLabelText(/harvested/i)).not.toBeInTheDocument()
  })

  it('appears for a clean crop', () => {
    renderForm(makeDraft({ landcoverClass: 'corn' }))
    expect(screen.getByLabelText(/harvested/i)).toBeInTheDocument()
  })

  it('appears for a dirty crop', () => {
    renderForm(makeDraft({ landcoverClass: 'rice/dirty' }))
    expect(screen.getByLabelText(/harvested/i)).toBeInTheDocument()
  })

  // moist-soil is managed for waterfowl, not taken off the field.
  it('is absent for moist-soil', () => {
    renderForm(makeDraft({ landcoverClass: 'moist-soil' }))
    expect(screen.queryByLabelText(/harvested/i)).not.toBeInTheDocument()
  })

  it('is absent for natural wetland vegetation', () => {
    renderForm(makeDraft({ landcoverClass: 'buttonbush' }))
    expect(screen.queryByLabelText(/harvested/i)).not.toBeInTheDocument()
  })

  it('is absent for "other"', () => {
    renderForm(makeDraft({ landcoverClass: 'other' }))
    expect(screen.queryByLabelText(/harvested/i)).not.toBeInTheDocument()
  })

  it('defaults to unknown', () => {
    renderForm(makeDraft({ landcoverClass: 'corn' }))
    expect(screen.getByLabelText(/harvested/i)).toHaveValue('unknown')
  })

  it('reports a harvest answer to the parent', async () => {
    const { onChange } = renderForm(makeDraft({ landcoverClass: 'corn' }))
    await userEvent.selectOptions(screen.getByLabelText(/harvested/i), 'yes')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ harvested: 'yes' }))
  })

  it('does not block submit while left at unknown', () => {
    renderForm(makeDraft({ landcoverClass: 'corn', year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeEnabled()
  })

  it('resets a stale harvest answer when the class becomes non-ag', async () => {
    const { onChange } = renderForm(
      makeDraft({ landcoverClass: 'corn', harvested: 'yes' }),
    )
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'buttonbush')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ landcoverClass: 'buttonbush', harvested: 'unknown' }),
    )
  })

  it('keeps the harvest answer when switching between two ag classes', async () => {
    const { onChange } = renderForm(
      makeDraft({ landcoverClass: 'corn', harvested: 'no' }),
    )
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'milo')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ landcoverClass: 'milo', harvested: 'no' }),
    )
  })
})

describe('PointForm — change propagation', () => {
  it('reports a class selection to the parent', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.selectOptions(screen.getByLabelText(/landcover/i), 'rice/dirty')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ landcoverClass: 'rice/dirty' }),
    )
  })

  it('reports the year as a number, not a string', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.selectOptions(screen.getByLabelText(/year/i), '2022')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ year: 2022 }))
  })

  it('reports notes as they are typed', async () => {
    const { onChange } = renderForm(makeDraft())
    await userEvent.type(screen.getByLabelText(/notes/i), 'x')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notes: 'x' }))
  })
})

describe('PointForm — submit gating', () => {
  it('disables submit when the class is missing', () => {
    renderForm(makeDraft({ year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('states the reason submit is blocked', () => {
    renderForm(makeDraft({ year: 2023 }))
    expect(screen.getByText(/choose a landcover class/i)).toBeInTheDocument()
  })

  it('disables submit when the year is missing', () => {
    renderForm(makeDraft({ landcoverClass: 'rice' }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('disables submit for "other" with no free text', () => {
    renderForm(makeDraft({ landcoverClass: 'other', classOther: '', year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeDisabled()
  })

  it('enables submit once class and year are set', () => {
    renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }))
    expect(screen.getByRole('button', { name: /submit|save/i })).toBeEnabled()
  })

  it('calls onSubmit when a valid form is submitted', async () => {
    const { onSubmit } = renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }))
    await userEvent.click(screen.getByRole('button', { name: /submit|save/i }))
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('PointForm — editing mode', () => {
  it('labels the button "Save changes" when editing', () => {
    renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }), { isEditing: true })
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('offers a cancel action when editing', async () => {
    const { onCancel } = renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }), {
      isEditing: true,
    })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('PointForm — blocking reason accessibility', () => {
  it('announces the blocking reason via role="alert" and links it to submit', () => {
    renderForm(makeDraft({ year: 2023 }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/choose a landcover class/i)

    const submitButton = screen.getByRole('button', { name: /submit|save/i })
    expect(submitButton).toHaveAttribute('aria-describedby', alert.id)
  })

  it('has no alert and no aria-describedby on submit when the form is valid', () => {
    renderForm(makeDraft({ landcoverClass: 'rice', year: 2023 }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const submitButton = screen.getByRole('button', { name: /submit|save/i })
    expect(submitButton).not.toHaveAttribute('aria-describedby')
  })
})
