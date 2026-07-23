import { describe, it, expect, vi } from 'vitest'

vi.mock('@oh-my-pi/pi-coding-agent', () => ({
  ModelRegistry: vi.fn(),
  SessionManager: { inMemory: vi.fn(() => ({})), create: vi.fn() },
  createAgentSession: vi.fn(),
  discoverAuthStorage: vi.fn(),
}))

const { Orchestrator } = await import('../src/main/orchestrator/index')

describe('Orchestrator', () => {
  it('should pass through text in dictation mode', async () => {
    const orchestrator = new Orchestrator()
    orchestrator.setMode('dictation')
    const result = await orchestrator.processVoiceInput('hello world')
    expect(result).toBe('hello world')
  })
})