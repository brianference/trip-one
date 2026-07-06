import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useTripStore } from '../store/tripStore'
import * as client from '../lib/api/client'

describe('ThemeSwitcher', () => {
  it('updates the store and persists the new style', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'liquid-glass' })
    vi.spyOn(client, 'updateTrip').mockResolvedValue({ id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'chronicle' })
    render(<ThemeSwitcher tripId="t1" />)
    fireEvent.change(screen.getByLabelText(/design/i), { target: { value: 'chronicle' } })
    await waitFor(() => expect(useTripStore.getState().designStyle).toBe('chronicle'))
    expect(client.updateTrip).toHaveBeenCalledWith('t1', { designStyle: 'chronicle' })
  })

  it('only offers Liquid Glass and Chronicle as choices', () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'liquid-glass' })
    render(<ThemeSwitcher tripId="t1" />)
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(['liquid-glass', 'chronicle'])
  })
})
