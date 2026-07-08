import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryStopForm } from './ItineraryStopForm'

describe('ItineraryStopForm', () => {
  it('submits the entered time/what/location and clears the fields', () => {
    const onSubmit = vi.fn()
    render(<ItineraryStopForm onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Breakfast' } })
    fireEvent.change(screen.getByLabelText('Location (optional)'), { target: { value: 'Cafe A' } })
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))

    expect(onSubmit).toHaveBeenCalledWith({ time: '09:00', text: 'Breakfast', locationText: 'Cafe A' })
    expect(screen.getByLabelText('Time')).toHaveValue('')
  })

  it('does not submit when time or what is blank', () => {
    const onSubmit = vi.fn()
    render(<ItineraryStopForm onSubmit={onSubmit} submitting={false} />)
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a busy label and disables submit while submitting', () => {
    render(<ItineraryStopForm onSubmit={vi.fn()} submitting={true} />)
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled()
  })
})
