import { describe, it, expect } from 'vitest'
import { mergeThingsToDo, type ThingToDo } from './mergeThingsToDo'

describe('mergeThingsToDo', () => {
  it('dedupes by lowercased name, preferring the tripadvisor entry', () => {
    const tripadvisor: ThingToDo[] = [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 }]
    const places: ThingToDo[] = [{ name: 'trinity college', category: 'tourist_attraction', source: 'places', rating: 4.4 }]
    const merged = mergeThingsToDo(tripadvisor, places)
    expect(merged).toEqual([{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 }])
  })

  it('keeps non-overlapping entries from both sources', () => {
    const tripadvisor: ThingToDo[] = [{ name: 'A', category: 'x', source: 'tripadvisor' }]
    const places: ThingToDo[] = [{ name: 'B', category: 'y', source: 'places' }]
    expect(mergeThingsToDo(tripadvisor, places)).toEqual([...tripadvisor, ...places])
  })
})
