import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useTripStore } from '../store/tripStore'
import * as client from '../lib/api/client'

describe('ThemeSwitcher', () => {
  it('updates the store and persists the new style', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    vi.spyOn(client, 'updateTrip').mockResolvedValue({ id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'trail-ledger' })
    render(<ThemeSwitcher tripId="t1" />)
    fireEvent.change(screen.getByLabelText(/design/i), { target: { value: 'trail-ledger' } })
    await waitFor(() => expect(useTripStore.getState().designStyle).toBe('trail-ledger'))
    expect(client.updateTrip).toHaveBeenCalledWith('t1', { designStyle: 'trail-ledger' })
  })
})
