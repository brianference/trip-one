import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryEntryRow } from './ItineraryEntryRow'

const base = { position: 0, total: 3, isFirst: false, isLast: false, onMoveEarlier: vi.fn(), onMoveLater: vi.fn(), onRemove: vi.fn() }

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

  it('disables move-earlier for the first item and move-later for the last', () => {
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'Only stop', type: 'option' }} isFirst isLast />)
    expect(screen.getByRole('button', { name: /move only stop earlier/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move only stop later/i })).toBeDisabled()
  })

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<ItineraryEntryRow {...base} item={{ time: '08:00', text: 'Drop me', type: 'option' }} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove drop me/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
