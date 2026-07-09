import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiPlanner } from './AiPlanner'
import * as client from '../../../lib/api/client'

const places = [
  { name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const, rating: 4.6 },
  { name: 'Time Out Market', category: 'restaurant', source: 'places' as const, rating: 4.5 },
]

describe('AiPlanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the request and hands the returned plan back via onPlan', async () => {
    const plan = [{ day: 1, placeIndexes: [0] }, { day: 2, placeIndexes: [1] }]
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue({ days: plan, message: 'Built it.' })
    const onPlan = vi.fn()
    render(<AiPlanner places={places} defaultDays={2} onPlan={onPlan} />)

    fireEvent.change(screen.getByPlaceholderText(/relaxed days/i), { target: { value: 'love history' } })
    fireEvent.click(screen.getByRole('button', { name: /build my itinerary/i }))

    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan, 2, expect.any(Array)))
    // sends only name/category/rating for the real places (grounded)
    expect(genSpy).toHaveBeenCalledWith('love history', 2, [
      { name: 'Belem Tower', category: 'tourist_attraction', rating: 4.6 },
      { name: 'Time Out Market', category: 'restaurant', rating: 4.5 },
    ])
  })

  it('caps candidates at 40 top-rated places so the request stays under the backend limit', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      name: `Place ${i}`,
      category: 'attraction',
      source: 'places' as const,
      rating: i, // Place 49 is highest-rated
    }))
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue({ days: [{ day: 1, placeIndexes: [0] }], message: 'ok' })
    const onPlan = vi.fn()
    render(<AiPlanner places={many} defaultDays={2} onPlan={onPlan} />)
    fireEvent.change(screen.getByPlaceholderText(/relaxed days/i), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /build my itinerary/i }))

    await waitFor(() => expect(genSpy).toHaveBeenCalled())
    const sentCandidates = genSpy.mock.calls[0][2]
    expect(sentCandidates).toHaveLength(40)
    // highest-rated first, so the top place is included and the lowest are dropped
    expect(sentCandidates[0].name).toBe('Place 49')
    expect(sentCandidates.map((c) => c.name)).not.toContain('Place 0')
    // the subset (not the full 50) is handed to onPlan so indices align
    await waitFor(() => expect(onPlan.mock.calls[0][2]).toHaveLength(40))
  })

  it('shows an error and does not call onPlan when generation fails', async () => {
    vi.spyOn(client, 'generatePlan').mockRejectedValue(new Error('AI planner unavailable, try again'))
    const onPlan = vi.fn()
    render(<AiPlanner places={places} defaultDays={3} onPlan={onPlan} />)

    fireEvent.change(screen.getByPlaceholderText(/relaxed days/i), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /build my itinerary/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i))
    expect(onPlan).not.toHaveBeenCalled()
  })

  it('disables the planner when there are no nearby places to ground on', () => {
    render(<AiPlanner places={[]} defaultDays={3} onPlan={vi.fn()} />)
    expect(screen.getByText(/nothing to plan from/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /build my itinerary/i })).toBeDisabled()
    // no suggested prompts when there's nothing to ground on
    expect(screen.queryByText(/or try one of these/i)).not.toBeInTheDocument()
  })

  it('running a suggested prompt sends that prompt to the planner', async () => {
    const plan = [{ day: 1, placeIndexes: [0] }]
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue({ days: plan, message: 'Built it.' })
    const onPlan = vi.fn()
    render(<AiPlanner places={places} defaultDays={2} onPlan={onPlan} />)

    const suggestion = screen.getByRole('button', { name: /foodie trip/i })
    fireEvent.click(suggestion)

    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan, 2, expect.any(Array)))
    expect(genSpy.mock.calls[0][0]).toMatch(/foodie trip/i)
  })
})
