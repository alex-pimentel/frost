import { ModelRegistry, SessionManager, createAgentSession, discoverAuthStorage } from '@oh-my-pi/pi-coding-agent'
import type { OrchestratorConfig, AgentResponse } from '../shared/types'

export class OmpBridge {
  private session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null
  private sessionManager: SessionManager | null = null
  private modelRegistry: ModelRegistry | null = null

  constructor() {
    this.sessionManager = SessionManager.inMemory()
    this.modelRegistry = new ModelRegistry({} as any)
  }

  async initialize(config: OrchestratorConfig): Promise<void> {
    const auth = await discoverAuthStorage()
    const models = new ModelRegistry(auth)
    await models.refresh()

    const { session } = await createAgentSession({
      sessionManager: this.sessionManager!,
      authStorage: auth,
      modelRegistry: models,
      modelPattern: `${config.modelProvider ?? 'openai'}/${config.modelId ?? 'gpt-4o-mini'}`,
    })
    this.session = session
  }

  async prompt(text: string): Promise<AgentResponse> {
    if (!this.session) throw new Error('OmpBridge not initialized. Call initialize() first.')
    await this.session.prompt(text)
    const agentMessages = this.session.messages
    const lastAssistant = [...agentMessages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) {
      return { text: '' }
    }
    const content = lastAssistant.content
    if (typeof content === 'string') {
      return { text: content }
    }
    const textParts = content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
    return { text: textParts.join('') }
  }

  async destroy(): Promise<void> {
    if (this.session) {
      await this.session.dispose()
      this.session = null
    }
  }
}
