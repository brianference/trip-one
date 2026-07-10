import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryEntryRow } from './ItineraryEntryRow'

const base = {
  position: 0,
  total: 3,
  isFirst: false,
  isLast: false,
  dayCount: 3,
  onMoveEarlier: vi.fn(),
  onMoveLater: vi.fn(),
  onMoveToDay: vi.fn(),
  onSetTime: vi.fn(),
  onRemove: vi.fn(),
}

describe('ItineraryEntryRow', () => {
  it('shows a role badge and a real directions link', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'Check in', type: 'fixed', q: 'Grand Hotel', category: 'lodging' }} />)
    // internal type badges are gone; museums/sights read as "Attraction"
    expect(screen.getByText('Attraction')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /directions/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Grand%20Hotel',
    )
  })

  it('labels a restaurant as a Meal', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '', text: 'Ramen Ichiran', type: 'option', category: 'restaurant' }} />)
    expect(screen.getByText('Meal')).toBeInTheDocument()
  })

  it('shows a soft time-of-day label when there is no clock time', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '', text: 'Park walk', type: 'option', category: 'park' }} position={0} total={4} />)
    expect(screen.getByText('Morning')).toBeInTheDocument()
  })

  it('keeps the edit controls hidden until Edit is toggled', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'A stop', type: 'option' }} />)
    expect(screen.queryByRole('button', { name: /move a stop earlier/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit a stop/i }))
    expect(screen.getByRole('button', { name: /move a stop earlier/i })).toBeInTheDocument()
  })

  it('disables move-earlier for the first item and move-later for the last', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'Only stop', type: 'option' }} isFirst isLast />)
    fireEvent.click(screen.getByRole('button', { name: /edit only stop/i }))
    expect(screen.getByRole('button', { name: /move only stop earlier/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move only stop later/i })).toBeDisabled()
  })

  it('sets a clock time from the time input', () => {
    const onSetTime = vi.fn()
    render(<ItineraryEntryRow {...base} item={{ time: '', text: 'Museum', type: 'option' }} onSetTime={onSetTime} />)
    fireEvent.click(screen.getByRole('button', { name: /edit museum/i }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:30' } })
    expect(onSetTime).toHaveBeenCalledWith('10:30')
  })

  it('moves the stop to another day via the day picker', () => {
    const onMoveToDay = vi.fn()
    render(<ItineraryEntryRow {...base} item={{ time: '', text: 'Museum', type: 'option', day: 1 }} onMoveToDay={onMoveToDay} />)
    fireEvent.click(screen.getByRole('button', { name: /edit museum/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /move museum to a different day/i }), { target: { value: '2' } })
    expect(onMoveToDay).toHaveBeenCalledWith(2)
  })

  it('hides the day picker on a single-day trip', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '', text: 'Museum', type: 'option' }} dayCount={1} />)
    fireEvent.click(screen.getByRole('button', { name: /edit museum/i }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'Drop me', type: 'option' }} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove drop me/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
