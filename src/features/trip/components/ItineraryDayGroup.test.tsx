import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDayGroup } from './ItineraryDayGroup'

const entries = [
  { item: { time: '09:00', text: 'Stop A', type: 'option' as const }, index: 0 },
  { item: { time: '10:00', text: 'Stop B', type: 'option' as const }, index: 1 },
]

describe('ItineraryDayGroup', () => {
  it('shows a Day N heading when showHeading is true', () => {
    render(<ItineraryDayGroup day={2} entries={entries} showHeading={true} onMove={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Day 2' })).toBeInTheDocument()
  })

  it('hides the heading for a single-day trip', () => {
    render(<ItineraryDayGroup day={1} entries={entries} showHeading={false} onMove={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'Day 1' })).not.toBeInTheDocument()
  })

  it('forwards move/remove calls with the right entry position and index', () => {
    const onMove = vi.fn()
    const onRemove = vi.fn()
    render(<ItineraryDayGroup day={1} entries={entries} showHeading={false} onMove={onMove} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /move stop b earlier/i }))
    expect(onMove).toHaveBeenCalledWith(entries, 1, -1)
    fireEvent.click(screen.getByRole('button', { name: /remove stop a/i }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})
