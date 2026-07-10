import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Phrasebook } from './Phrasebook'

describe('Phrasebook', () => {
  const speak = vi.fn()
  const cancel = vi.fn()

  beforeEach(() => {
    speak.mockClear()
    cancel.mockClear()
    // Provide a SpeechSynthesis so the speaker button renders and works.
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string
        lang = ''
        rate = 1
        constructor(text: string) {
          this.text = text
        }
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders a real phrase list when phrases are given', () => {
    render(<Phrasebook phrases={[{ english: 'Hello', translation: 'Bonjour' }]} language="french" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Bonjour')).toBeInTheDocument()
  })

  it('renders nothing when there are no phrases (English/US destinations get no phrasebook)', () => {
    const { container } = render(<Phrasebook phrases={null} language={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('speaks the native text in the destination voice when the speaker is tapped', () => {
    render(<Phrasebook phrases={[{ english: 'Hello', translation: '你好 (Nǐ hǎo)' }]} language="mandarin" />)
    fireEvent.click(screen.getByRole('button', { name: /hear "hello" spoken/i }))
    expect(cancel).toHaveBeenCalled()
    expect(speak).toHaveBeenCalledTimes(1)
    const utterance = speak.mock.calls[0][0]
    expect(utterance.text).toBe('你好') // romanization stripped
    expect(utterance.lang).toBe('zh-CN')
  })

  it('hides the speaker button when the browser has no speech support', () => {
    vi.unstubAllGlobals()
    render(<Phrasebook phrases={[{ english: 'Hello', translation: 'Bonjour' }]} language="french" />)
    expect(screen.queryByRole('button', { name: /hear/i })).not.toBeInTheDocument()
  })
})
