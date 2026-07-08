import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SaveErrorBanner } from './SaveErrorBanner'
import { useTripStore } from '../../../store/tripStore'
import * as client from '../../../lib/api/client'

describe('SaveErrorBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useTripStore.setState({ saveError: false, tripId: null })
  })

  it('renders nothing while saves are succeeding', () => {
    useTripStore.setState({ saveError: false, tripId: 't1' })
    const { container } = render(<SaveErrorBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an alert when a save failed', () => {
    useTripStore.setState({ saveError: true, tripId: 't1' })
    render(<SaveErrorBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('retry re-queues the current state and clears the error on success', async () => {
    useTripStore.setState({
      saveError: true,
      tripId: 't1',
      itinerary: [{ time: '', text: 'Keep me', type: 'option' }],
      tripLengthDays: 2,
    })
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 's',
      itinerary: [],
      designStyle: 'chronicle',
    })
    render(<SaveErrorBanner />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const patch = updateSpy.mock.calls[0][1] as { itinerary?: { text: string }[]; tripLengthDays?: number }
    expect(patch.itinerary?.[0].text).toBe('Keep me')
    expect(patch.tripLengthDays).toBe(2)
    expect(useTripStore.getState().saveError).toBe(false)
  })
})
