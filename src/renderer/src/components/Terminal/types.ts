/** Types for the NanoCore Agent Terminal. */

export type FeedItemType =
  | 'user'
  | 'ai_text'
  | 'tool_start'
  | 'tool_output'
  | 'diff_proposal'
  | 'error'
  | 'info'

export interface DiffMetadata {
  callId: string
  filePath: string
  oldContent: string
  newContent: string
  diff: string
  status: 'pending' | 'approved' | 'rejected'
  rejectReason?: string
}

export interface ToolMetadata {
  callId: string
  tool: string
  command?: string
  exitCode?: number
}

export interface FeedItem {
  id: string
  type: FeedItemType
  content: string
  timestamp: number
  toolMeta?: ToolMetadata
  diffMeta?: DiffMetadata
}

export interface TelemetryAction {
  timestamp: number
  action: string
  detail: string
}

export interface TelemetryData {
  agent: string
  state: string
  tokensUsed: number
  elapsedMs: number
  iteration: number
  actions: TelemetryAction[]
}

export interface SSEEvent {
  event: string
  data: Record<string, unknown>
}
