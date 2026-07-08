import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayTabs } from './DayTabs'

describe('DayTabs', () => {
  it('renders nothing for a single-day trip', () => {
    const { container } = render(<DayTabs dayCount={1} selectedDay={1} onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a tab per day and marks the selected one', () => {
    render(<DayTabs dayCount={3} selectedDay={2} onSelect={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Day 1' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Day 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Day 3' })).toBeInTheDocument()
  })

  it('calls onSelect with the clicked day', () => {
    const onSelect = vi.fn()
    render(<DayTabs dayCount={2} selectedDay={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Day 2' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
