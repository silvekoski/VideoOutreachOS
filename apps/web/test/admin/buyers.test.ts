import { describe, expect, it } from 'vitest'
import { moveItem } from '../../src/admin/lib/buyers.ts'

describe('moveItem', () => {
  it('moves an item up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('returns a copy for a move outside the list', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(items, 1, 2)).not.toBe(items)
  })
})
