import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThingsToDoList } from './ThingsToDoList'

const items = [
  { name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const, rating: 4.6 },
  { name: 'Time Out Market', category: 'restaurant', source: 'places' as const, rating: 4.4 },
]

describe('ThingsToDoList', () => {
  it('renders a rated card per suggestion and forwards Add clicks', () => {
    const onAdd = vi.fn()
    render(<ThingsToDoList thingsToDo={items} onAdd={onAdd} onSelect={vi.fn()} />)
    expect(screen.getByText('Belem Tower')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /add .*to itinerary/i })[0])
    expect(onAdd).toHaveBeenCalled()
  })

  it('opens the detail panel when a suggestion name is clicked', () => {
    const onSelect = vi.fn()
    render(<ThingsToDoList thingsToDo={items} onAdd={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Belem Tower' }))
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('filters by category', () => {
    render(<ThingsToDoList thingsToDo={items} onAdd={vi.fn()} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByText('Time Out Market')).toBeInTheDocument()
    expect(screen.queryByText('Belem Tower')).not.toBeInTheDocument()
  })

  it('hides unrated places until "Show unrated" is toggled', () => {
    const withUnrated = [...items, { name: 'Random Church', category: 'church', source: 'places' as const }]
    render(<ThingsToDoList thingsToDo={withUnrated} onAdd={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByText('Random Church')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show unrated/i }))
    expect(screen.getByText('Random Church')).toBeInTheDocument()
  })

  it('marks places already on the plan', () => {
    render(<ThingsToDoList thingsToDo={items} plannedNames={new Set(['Belem Tower'])} onAdd={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText(/on your trip/i)).toBeInTheDocument()
  })

  it('shows an empty message when there are no suggestions', () => {
    render(<ThingsToDoList thingsToDo={[]} onAdd={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText(/no nearby suggestions/i)).toBeInTheDocument()
  })
})
