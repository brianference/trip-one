import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItineraryPage } from './ItineraryPage'
import { useTripStore } from '../../../store/tripStore'
import * as client from '../../../lib/api/client'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useOutletContext: () => ({
      trip: { id: 't1', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
      location: null,
    }),
    useNavigate: () => vi.fn(),
  }
})

describe('ItineraryPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds a stop and shows it in the list', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'lisbon-portugal', itinerary: [], tripLengthDays: null })
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    render(<ItineraryPage />)
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Breakfast' } })
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
  })

  it('shows the empty state when there are no stops', () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'lisbon-portugal', itinerary: [], tripLengthDays: null })
    render(<ItineraryPage />)
    expect(screen.getByText(/no stops yet/i)).toBeInTheDocument()
  })
})
