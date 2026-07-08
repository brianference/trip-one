import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryEntryRow } from './ItineraryEntryRow'

describe('ItineraryEntryRow', () => {
  it('shows a Booked badge for a fixed item and a real directions link', () => {
    render(
      <ItineraryEntryRow
        item={{ time: '08:00', text: 'Check in', type: 'fixed', q: 'Grand Hotel' }}
        isFirst={false}
        isLast={false}
        onMoveEarlier={vi.fn()}
        onMoveLater={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /directions/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Grand%20Hotel',
    )
  })

  it('disables move-earlier for the first item and move-later for the last', () => {
    render(
      <ItineraryEntryRow
        item={{ time: '08:00', text: 'Only stop', type: 'option' }}
        isFirst={true}
        isLast={true}
        onMoveEarlier={vi.fn()}
        onMoveLater={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /move only stop earlier/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move only stop later/i })).toBeDisabled()
  })

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <ItineraryEntryRow
        item={{ time: '08:00', text: 'Drop me', type: 'option' }}
        isFirst={false}
        isLast={false}
        onMoveEarlier={vi.fn()}
        onMoveLater={vi.fn()}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remove drop me/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
