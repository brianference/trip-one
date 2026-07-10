import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Phrasebook } from './Phrasebook'

describe('Phrasebook', () => {
  const play = vi.fn(() => Promise.resolve())
  const audioInstances: { src: string }[] = []
  const speak = vi.fn()
  const cancel = vi.fn()

  beforeEach(() => {
    play.mockClear()
    audioInstances.length = 0
    speak.mockClear()
    cancel.mockClear()
    // Pre-generated audio path.
    vi.stubGlobal(
      'Audio',
      class {
        src: string
        constructor(src: string) {
          this.src = src
          audioInstances.push(this)
        }
        addEventListener() {}
        play = play
      },
    )
    // SpeechSynthesis fallback.
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

  it('plays the pre-generated clip for the phrase index when the speaker is tapped', () => {
    render(
      <Phrasebook
        phrases={[
          { english: 'Hello', translation: '你好 (Nǐ hǎo)' },
          { english: 'Thank you', translation: '谢谢 (Xièxiè)' },
        ]}
        language="mandarin"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /hear "thank you" spoken/i }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(audioInstances[0].src).toContain('/audio/mandarin/1.mp3')
  })

  it('hides the speaker button when the browser can neither play audio nor speak', () => {
    // No Audio and no SpeechSynthesis at all (e.g. server-side / very old client).
    vi.stubGlobal('Audio', undefined)
    vi.stubGlobal('speechSynthesis', undefined)
    vi.stubGlobal('SpeechSynthesisUtterance', undefined)
    render(<Phrasebook phrases={[{ english: 'Hello', translation: 'Bonjour' }]} language="french" />)
    expect(screen.queryByRole('button', { name: /hear/i })).not.toBeInTheDocument()
  })
})
