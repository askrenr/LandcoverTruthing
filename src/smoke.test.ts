import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs and has jsdom available', () => {
    expect(typeof document).toBe('object')
    expect(localStorage).toBeDefined()
  })
})
