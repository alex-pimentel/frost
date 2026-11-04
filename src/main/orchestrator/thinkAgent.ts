/**
 * INERT: not imported by the running app. The live system prompt is composed in
 * `src/main/orchestrator/systemPrompt.js`.
 */
import { OmpBridge } from '../omp-bridge'
import type { AgentResponse, ThinkAgentConfig, PipelineCallback, PipelineStep } from '../../shared/types'

const DEFAULT_SYSTEM_PROMPT = `You are Frost, a warm, thoughtful conversational AI. You speak naturally and concisely — like a clever friend who's also a world-class engineer. You're slightly more reserved than Pi (a bit "cooler"), but still genuinely helpful and engaging. You can search the web, read files, and use tools when needed, but you don't over-engineer simple conversations.`

export class ThinkAgent {
  private bridge: OmpBridge
  private config: ThinkAgentConfig

  constructor(bridge: OmpBridge, config?: Partial<ThinkAgentConfig>) {
    this.bridge = bridge
    this.config = {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      modelProvider: 'openai',
      modelId: 'gpt-4o-mini',
      ...config
    }
  }

  async think(input: string, onStep?: PipelineCallback): Promise<AgentResponse> {
    onStep?.({ type: 'think', status: 'running' })
    const start = Date.now()
    try {
      const response = await this.bridge.prompt(input)
      onStep?.({ type: 'think', status: 'completed', durationMs: Date.now() - start })
      return response
    } catch (err) {
      onStep?.({ type: 'think', status: 'error', durationMs: Date.now() - start, error: String(err) })
      throw err
    }
  }
}