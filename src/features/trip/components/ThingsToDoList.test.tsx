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

  it('renders experience cards when nearby places are empty but experiences are present', () => {
    // Experiences do not depend on Places/Tripadvisor. A trip whose location
    // has zero things_to_do must still show bookable Viator products when the
    // experiences endpoint returned them (Task B gap: silent empty list).
    const experiencesOnly = [
      {
        name: 'Tokyo Sushi Making Class',
        category: 'experience',
        source: 'viator' as const,
        rating: 4.9,
        numReviews: 1200,
        priceFrom: 89,
        currency: 'USD',
        durationMinutes: 120,
        productCode: 'TKY-SUSHI',
        bookingUrl: 'https://www.viator.com/tours/Tokyo/Sushi/d334-x',
      },
      {
        name: 'Mt Fuji Day Trip',
        category: 'experience',
        source: 'viator' as const,
        rating: 4.7,
        numReviews: 800,
        priceFrom: 120,
        currency: 'USD',
        durationMinutes: 600,
        productCode: 'TKY-FUJI',
        bookingUrl: 'https://www.viator.com/tours/Tokyo/Fuji/d334-y',
      },
    ]
    render(<ThingsToDoList thingsToDo={experiencesOnly} onAdd={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByText(/no nearby suggestions/i)).not.toBeInTheDocument()
    expect(screen.getByText('Tokyo Sushi Making Class')).toBeInTheDocument()
    expect(screen.getByText('Mt Fuji Day Trip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Experiences' })).toBeInTheDocument()
    expect(screen.getAllByRole('article', { name: /bookable experience/i })).toHaveLength(2)
  })
})
