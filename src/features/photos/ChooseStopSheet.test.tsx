import { useRef, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { ChooseStopSheet } from './ChooseStopSheet'
import type { ItineraryItem } from '../../lib/validation/schemas'

const DAY1_STOP = '5a0b1c2d-0000-4000-8000-000000000001'
const DAY1_STOP_2 = '5a0b1c2d-0000-4000-8000-000000000002'
const DAY2_STOP = '5a0b1c2d-0000-4000-8000-000000000003'

const itinerary: ItineraryItem[] = [
  { time: '09:00', text: 'Trinity College', type: 'fixed', id: DAY1_STOP, day: 1 },
  { time: '13:00', text: 'Guinness Storehouse', type: 'fixed', id: DAY1_STOP_2, day: 1 },
  { time: '10:00', text: 'Cliffs of Moher', type: 'fixed', id: DAY2_STOP, day: 2 },
]

/** Renders a real "Add photos" trigger button plus the sheet, mirroring how TripHeaderActions wires them. */
function Harness({ selectedDay = 1, onChoosePhoto = vi.fn() }: { selectedDay?: number; onChoosePhoto?: (stopId: string, file: File) => void }) {
  const [open, setOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Add photos
      </button>
      {open && (
        <ChooseStopSheet
          itinerary={itinerary}
          startDate={null}
          selectedDay={selectedDay}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          onChoosePhoto={(stopId, file) => {
            onChoosePhoto(stopId, file)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

describe('ChooseStopSheet', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a labelled dialog with a radio group listing every stop with an id', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Which stop is this photo for?' })
    expect(within(dialog).getByRole('radio', { name: 'Trinity College' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Guinness Storehouse' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Cliffs of Moher' })).toBeInTheDocument()
  })

  it('groups stops under "Day N" headings, selected day first', () => {
    render(<Harness selectedDay={2} />)
    const dialog = screen.getByRole('dialog')
    const headings = within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Day 2', 'Day 1'])
  })

  it('defaults the selection to the first stop of the selected day', () => {
    render(<Harness selectedDay={1} />)
    expect(screen.getByRole('radio', { name: 'Trinity College' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Guinness Storehouse' })).not.toBeChecked()
  })

  it('choosing a different stop then picking a file uploads to that stop, not the default', () => {
    const onChoosePhoto = vi.fn()
    render(<Harness selectedDay={1} onChoosePhoto={onChoosePhoto} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Guinness Storehouse' }))
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(onChoosePhoto).toHaveBeenCalledWith(DAY1_STOP_2, file)
  })

  it('the hidden file input carries the selected stop in its accessible name', () => {
    render(<Harness selectedDay={1} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cliffs of Moher' }))
    expect(document.querySelector('input[type="file"]')).toHaveAttribute('aria-label', 'Choose a photo for Cliffs of Moher')
  })

  it('closes on Escape', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on an overlay click but not on a click inside the dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // The overlay is the dialog's positioning parent — click it directly.
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab focus: Tab from the last focusable element wraps to the first', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog')
    const focusable = Array.from(dialog.querySelectorAll('button, input')) as HTMLElement[]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('traps Tab focus: Shift+Tab from the first focusable element wraps to the last', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog')
    const focusable = Array.from(dialog.querySelectorAll('button, input')) as HTMLElement[]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first.focus()
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('gives each day group its own radio name, shared by that day\'s stops only', () => {
    render(<Harness />)
    const name = (label: string) => (screen.getByRole('radio', { name: label }) as HTMLInputElement).name
    expect(name('Trinity College')).toBe(name('Guinness Storehouse'))
    expect(name('Cliffs of Moher')).not.toBe(name('Trinity College'))
    expect(name('Trinity College')).not.toBe('')
  })

  it('leaves out stops without an id (they cannot hold a photo)', () => {
    const legacyStop: ItineraryItem = { time: '', text: 'Legacy stop', type: 'fixed', day: 1 }
    render(
      <ChooseStopSheet
        itinerary={[...itinerary, legacyStop]}
        startDate={null}
        selectedDay={1}
        triggerRef={{ current: null }}
        onClose={vi.fn()}
        onChoosePhoto={vi.fn()}
      />,
    )
    expect(screen.queryByRole('radio', { name: 'Legacy stop' })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('says to add a stop first, with Choose photo disabled, when no stop has an id', () => {
    render(
      <ChooseStopSheet
        itinerary={[{ text: 'Legacy stop', day: 1 }]}
        startDate={null}
        selectedDay={1}
        triggerRef={{ current: null }}
        onClose={vi.fn()}
        onChoosePhoto={vi.fn()}
      />,
    )
    expect(screen.getByText('Add a stop to this trip before adding photos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeDisabled()
  })

  it('returns focus to the Add photos button that opened it once closed', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Add photos' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })
})
