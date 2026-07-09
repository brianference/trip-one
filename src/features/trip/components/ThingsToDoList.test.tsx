import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThingsToDoList } from './ThingsToDoList'

describe('ThingsToDoList', () => {
  it('renders a card per suggestion and forwards Add clicks', () => {
    const onAdd = vi.fn()
    const items = [
      { name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const },
      { name: 'Cafe A Brasileira', category: 'cafe', source: 'places' as const },
    ]
    render(<ThingsToDoList thingsToDo={items} onAdd={onAdd} onSelect={vi.fn()} />)
    expect(screen.getByText('Belem Tower')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /add to itinerary/i })[0])
    expect(onAdd).toHaveBeenCalledWith(items[0])
  })

  it('opens the detail panel when a suggestion name is clicked', () => {
    const onSelect = vi.fn()
    const items = [{ name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const }]
    render(<ThingsToDoList thingsToDo={items} onAdd={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Belem Tower' }))
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('shows an empty message when there are no suggestions', () => {
    render(<ThingsToDoList thingsToDo={[]} onAdd={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText(/no nearby suggestions/i)).toBeInTheDocument()
  })
})
