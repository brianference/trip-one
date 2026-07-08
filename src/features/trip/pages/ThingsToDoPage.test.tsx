import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThingsToDoPage } from './ThingsToDoPage'
import { useTripStore } from '../../../store/tripStore'
import * as client from '../../../lib/api/client'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useOutletContext: () => ({
      trip: { id: 't1', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
      location: {
        slug: 'lisbon-portugal',
        lat: 38.7,
        lng: -9.1,
        displayName: 'Lisbon, Portugal',
        thingsToDo: [{ name: 'Belem Tower', category: 'tourist_attraction', source: 'places', lat: 38.69, lng: -9.21 }],
      },
    }),
  }
})

describe('ThingsToDoPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds a suggestion to the itinerary, carrying coordinates through', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'lisbon-portugal', itinerary: [], tripLengthDays: null })
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    render(<ThingsToDoPage />)
    fireEvent.click(screen.getByRole('button', { name: /add to itinerary/i }))
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string; lat?: number }>
    expect(persisted.find((i) => i.text === 'Belem Tower')?.lat).toBe(38.69)
  })
})
