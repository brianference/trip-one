import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TripChatPanel } from './TripChatPanel'
import type { ChatMessage } from './chatTypes'

const greeting: ChatMessage[] = [{ id: 'g', role: 'assistant', text: 'Tell me what you want.', ts: 1 }]

describe('TripChatPanel', () => {
  it('renders messages and shows starters before the first user turn', () => {
    render(<TripChatPanel messages={greeting} isThinking={false} error={null} disabled={false} onSend={vi.fn()} />)
    expect(screen.getByText('Tell me what you want.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /foodie trip/i })).toBeInTheDocument()
  })

  it('sends the composer text and clears the input', () => {
    const onSend = vi.fn()
    render(<TripChatPanel messages={greeting} isThinking={false} error={null} disabled={false} onSend={onSend} />)
    const input = screen.getByLabelText(/message the trip planner/i)
    fireEvent.change(input, { target: { value: 'add more food stops' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('add more food stops')
  })

  it('tapping a starter sends it', () => {
    const onSend = vi.fn()
    render(<TripChatPanel messages={greeting} isThinking={false} error={null} disabled={false} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: /kid-friendly/i }))
    expect(onSend).toHaveBeenCalledWith('Kid-friendly, easy walking, one museum a day')
  })

  it('hides starters once the traveler has spoken', () => {
    const withUser: ChatMessage[] = [...greeting, { id: 'u', role: 'user', text: 'hi', ts: 2 }]
    render(<TripChatPanel messages={withUser} isThinking={false} error={null} disabled={false} onSend={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /foodie trip/i })).not.toBeInTheDocument()
  })

  it('shows the thinking indicator and blocks sending while thinking', () => {
    const onSend = vi.fn()
    render(<TripChatPanel messages={greeting} isThinking error={null} disabled={false} onSend={onSend} />)
    expect(screen.getByLabelText(/planner is thinking/i)).toBeInTheDocument()
    const input = screen.getByLabelText(/message the trip planner/i)
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('surfaces an error message', () => {
    render(<TripChatPanel messages={greeting} isThinking={false} error="No nearby places" disabled onSend={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no nearby places/i)
  })
})
