export type FrostMode = 'dictation' | 'chat' | 'code'

export interface OrchestratorConfig {
  mode: FrostMode
  modelProvider?: string
  modelId?: string
  voiceEnabled: boolean
  toolsEnabled: boolean
}

export interface AgentResponse {
  text: string
  toolCalls?: ToolCallRecord[]
  error?: string
}

export interface ToolCallRecord {
  toolName: string
  params: Record<string, unknown>
  result: string
  timestamp: number
}

export interface PipelineStep {
  type: 'stt' | 'think' | 'cactus' | 'tts'
  status: 'pending' | 'running' | 'completed' | 'error'
  durationMs?: number
  error?: string
}

export type PipelineCallback = (step: PipelineStep) => void

export interface ThinkAgentConfig {
  systemPrompt: string
  modelProvider: string
  modelId: string
}
