import { describe, it, expect, vi } from 'vitest'

vi.mock('@oh-my-pi/pi-coding-agent', () => ({
  ModelRegistry: vi.fn(),
  SessionManager: { inMemory: vi.fn(() => ({})), create: vi.fn() },
  createAgentSession: vi.fn(),
  discoverAuthStorage: vi.fn(),
}))

const { OmpBridge } = await import('../src/main/omp-bridge')

describe('OmpBridge', () => {
  it('should throw if used before initialize', async () => {
    const bridge = new OmpBridge()
    await expect(bridge.prompt('hello')).rejects.toThrow('not initialized')
  })
})
