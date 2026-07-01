import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryScreen } from './ItineraryScreen'
import { useTripStore } from '../../store/tripStore'

describe('ItineraryScreen', () => {
  it('adds an item to the store when the form is submitted', () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    render(<ItineraryScreen />)
    fireEvent.change(screen.getByLabelText(/time/i), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText(/what/i), { target: { value: 'Breakfast' } })
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    expect(useTripStore.getState().itinerary).toHaveLength(1)
  })

  it('removes an item from the store', () => {
    useTripStore.setState({
      tripId: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [{ time: '09:00', text: 'Breakfast', type: 'option' }],
      designStyle: 'bento',
    })
    render(<ItineraryScreen />)
    fireEvent.click(screen.getByRole('button', { name: /remove breakfast/i }))
    expect(useTripStore.getState().itinerary).toHaveLength(0)
  })
})
