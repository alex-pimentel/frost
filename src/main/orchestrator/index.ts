import { OmpBridge } from '../omp-bridge'
import { ThinkAgent } from './thinkAgent'
import { Pipeline } from './pipeline'
import type { FrostMode, OrchestratorConfig, PipelineCallback } from '../../shared/types'

export class Orchestrator {
  private bridge: OmpBridge
  private thinkAgent: ThinkAgent
  private pipeline: Pipeline
  private mode: FrostMode = 'chat'

  constructor(config?: Partial<OrchestratorConfig>) {
    this.bridge = new OmpBridge()
    this.thinkAgent = new ThinkAgent(this.bridge)
    this.pipeline = new Pipeline(this.thinkAgent)
  }

  async initialize(config?: Partial<OrchestratorConfig>): Promise<void> {
    this.mode = config?.mode ?? 'chat'
    await this.bridge.initialize({
      mode: this.mode,
      voiceEnabled: config?.voiceEnabled ?? true,
      toolsEnabled: config?.toolsEnabled ?? this.mode !== 'dictation'
    })
  }

  async processVoiceInput(text: string, onStep?: PipelineCallback): Promise<string> {
    if (this.mode === 'dictation') {
      return text
    }
    return this.pipeline.run(text)
  }

  setMode(mode: FrostMode): void {
    this.mode = mode
  }

  async destroy(): Promise<void> {
    await this.bridge.destroy()
  }
}