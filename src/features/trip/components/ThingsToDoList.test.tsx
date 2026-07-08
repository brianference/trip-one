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
    render(<ThingsToDoList thingsToDo={items} onAdd={onAdd} />)
    expect(screen.getByText('Belem Tower')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /add to itinerary/i })[0])
    expect(onAdd).toHaveBeenCalledWith(items[0])
  })

  it('shows an empty message when there are no suggestions', () => {
    render(<ThingsToDoList thingsToDo={[]} onAdd={vi.fn()} />)
    expect(screen.getByText(/no nearby suggestions/i)).toBeInTheDocument()
  })
})
