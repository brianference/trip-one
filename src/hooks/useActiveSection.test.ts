import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActiveSection } from './useActiveSection'

describe('useActiveSection', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('defaults to the first section id before anything is observed', () => {
    const { result } = renderHook(() => useActiveSection(['overview', 'itinerary']))
    expect(result.current).toBe('overview')
  })

  it('does not throw when none of the section ids exist in the DOM', () => {
    expect(() => renderHook(() => useActiveSection(['missing-one', 'missing-two']))).not.toThrow()
  })

  it('updates to whichever observed section is closest to the top', () => {
    document.body.innerHTML = '<div id="overview"></div><div id="itinerary"></div>'
    let capturedCallback: IntersectionObserverCallback = () => {}
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn((callback: IntersectionObserverCallback) => {
        capturedCallback = callback
        return { observe: observeMock, disconnect: disconnectMock, unobserve: vi.fn() }
      }),
    )

    const { result } = renderHook(() => useActiveSection(['overview', 'itinerary']))
    expect(observeMock).toHaveBeenCalledTimes(2)

    const itineraryEl = document.getElementById('itinerary') as HTMLElement
    act(() => {
      capturedCallback(
        [
          {
            isIntersecting: true,
            target: itineraryEl,
            boundingClientRect: { top: 10 } as DOMRectReadOnly,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )
    })

    expect(result.current).toBe('itinerary')
  })
})
