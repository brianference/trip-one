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
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue(plan)
    const onPlan = vi.fn()
    render(<AiPlanner places={places} defaultDays={2} onPlan={onPlan} />)

    fireEvent.change(screen.getByPlaceholderText(/relaxed days/i), { target: { value: 'love history' } })
    fireEvent.click(screen.getByRole('button', { name: /build my itinerary/i }))

    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan, 2))
    // sends only name/category/rating for the real places (grounded)
    expect(genSpy).toHaveBeenCalledWith('love history', 2, [
      { name: 'Belem Tower', category: 'tourist_attraction', rating: 4.6 },
      { name: 'Time Out Market', category: 'restaurant', rating: 4.5 },
    ])
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
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue(plan)
    const onPlan = vi.fn()
    render(<AiPlanner places={places} defaultDays={2} onPlan={onPlan} />)

    const suggestion = screen.getByRole('button', { name: /foodie trip/i })
    fireEvent.click(suggestion)

    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(plan, 2))
    expect(genSpy.mock.calls[0][0]).toMatch(/foodie trip/i)
  })
})
