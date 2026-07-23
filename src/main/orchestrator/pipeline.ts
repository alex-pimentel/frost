import { ThinkAgent } from './thinkAgent'
import type { PipelineCallback } from '../../shared/types'

export interface PipelineConfig {
  systemPrompt?: string
  modelProvider?: string
  modelId?: string
}

export class Pipeline {
  private thinkAgent: ThinkAgent
  private onStep?: PipelineCallback

  constructor(thinkAgent: ThinkAgent, onStep?: PipelineCallback) {
    this.thinkAgent = thinkAgent
    this.onStep = onStep
  }

  async run(input: string, onStep?: PipelineCallback): Promise<string> {
    const callback = onStep ?? this.onStep
    const response = await this.thinkAgent.think(input, callback)
    return response.text
  }
}