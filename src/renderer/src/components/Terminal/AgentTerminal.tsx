import { useState, useCallback, useRef, useEffect } from 'react'
import { PanelRightOpen, PanelRightClose, Trash2 } from 'lucide-react'
import { useGlobalState } from '../../context/GlobalState'
import { apiClient } from '../../api/client'
import { MessageFeed } from './MessageFeed'
import { InputBar } from './InputBar'
import { TelemetrySidebar } from './TelemetrySidebar'
import type { FeedItem, TelemetryData, SSEEvent } from './types'

const EMPTY_TELEMETRY: TelemetryData = {
  agent: '',
  state: 'idle',
  tokensUsed: 0,
  elapsedMs: 0,
  iteration: 0,
  actions: [],
}

const STORAGE_KEY_FEED = 'nanocore-terminal-feed'
const STORAGE_KEY_TELEMETRY = 'nanocore-terminal-telemetry'

function loadPersistedFeed(): FeedItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_FEED)
    if (!raw) return []
    const items: FeedItem[] = JSON.parse(raw)
    // Mark any pending diffs as expired (backend session is gone after refresh)
    return items.map((it) =>
      it.diffMeta?.status === 'pending'
        ? { ...it, diffMeta: { ...it.diffMeta, status: 'rejected', rejectReason: 'Session lost (page refreshed)' } }
        : it
    )
  } catch {
    return []
  }
}

function loadPersistedTelemetry(): TelemetryData {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_TELEMETRY)
    return raw ? JSON.parse(raw) : EMPTY_TELEMETRY
  } catch {
    return EMPTY_TELEMETRY
  }
}

export function AgentTerminal() {
  const { activeModel } = useGlobalState()
  const [feedItems, setFeedItems] = useState<FeedItem[]>(loadPersistedFeed)
  const [isRunning, setIsRunning] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [telemetry, setTelemetry] = useState<TelemetryData>(loadPersistedTelemetry)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Persist feed items and telemetry to sessionStorage on change
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY_FEED, JSON.stringify(feedItems)) } catch { /* quota */ }
  }, [feedItems])
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY_TELEMETRY, JSON.stringify(telemetry)) } catch { /* quota */ }
  }, [telemetry])

  const clearHistory = useCallback(() => {
    setFeedItems([])
    setTelemetry(EMPTY_TELEMETRY)
    sessionStorage.removeItem(STORAGE_KEY_FEED)
    sessionStorage.removeItem(STORAGE_KEY_TELEMETRY)
  }, [])

  // Track the current AI text item id to append streamed tokens
  const aiTextIdRef = useRef<string | null>(null)
  // Track tool output accumulator
  const toolOutputIdRef = useRef<string | null>(null)

  const addFeedItem = useCallback((item: FeedItem) => {
    setFeedItems((prev) => [...prev, item])
  }, [])

  const updateFeedItem = useCallback((id: string, updater: (item: FeedItem) => FeedItem) => {
    setFeedItems((prev) => prev.map((it) => (it.id === id ? updater(it) : it)))
  }, [])

  const handleDiffDecided = useCallback((callId: string, approved: boolean, reason?: string) => {
    setFeedItems((prev) =>
      prev.map((it) =>
        it.diffMeta?.callId === callId
          ? { ...it, diffMeta: { ...it.diffMeta, status: approved ? 'approved' : 'rejected', rejectReason: reason } }
          : it
      )
    )
  }, [])

  const handleSubmit = useCallback(async (prompt: string) => {
    if (!activeModel || isRunning) return

    // Add user message
    const userId = crypto.randomUUID()
    addFeedItem({ id: userId, type: 'user', content: prompt, timestamp: Date.now() })

    setIsRunning(true)
    setTelemetry(EMPTY_TELEMETRY)
    aiTextIdRef.current = null
    toolOutputIdRef.current = null

    const { url, body } = apiClient.terminal.runUrl(prompt, activeModel.id)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        addFeedItem({ id: crypto.randomUUID(), type: 'error', content: `Request failed: ${res.status}`, timestamp: Date.now() })
        setIsRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          let evt: SSEEvent
          try {
            evt = JSON.parse(jsonStr)
          } catch {
            continue
          }

          processEvent(evt)
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const evt: SSEEvent = JSON.parse(buffer.slice(6).trim())
          processEvent(evt)
        } catch {
          // ignore
        }
      }
    } catch (err) {
      addFeedItem({ id: crypto.randomUUID(), type: 'error', content: String(err), timestamp: Date.now() })
    } finally {
      setIsRunning(false)
      aiTextIdRef.current = null
      toolOutputIdRef.current = null
    }

    function processEvent(evt: SSEEvent) {
      const d = evt.data

      switch (evt.event) {
        case 'session_start':
          setSessionId(d.session_id as string)
          break

        case 'token_stream': {
          const text = d.text as string
          if (!aiTextIdRef.current) {
            const id = crypto.randomUUID()
            aiTextIdRef.current = id
            addFeedItem({ id, type: 'ai_text', content: text, timestamp: Date.now() })
          } else {
            updateFeedItem(aiTextIdRef.current, (it) => ({ ...it, content: it.content + text }))
          }
          // Reset tool output ref when we get AI text
          toolOutputIdRef.current = null
          break
        }

        case 'tool_start': {
          // End current AI text stream
          aiTextIdRef.current = null
          toolOutputIdRef.current = null

          const tool = d.tool as string
          const cmd = (d.args as Record<string, string>)?.command || ''
          const callId = d.call_id as string
          const label = tool === 'run_bash' ? `$ ${cmd}` : `${tool}`
          addFeedItem({
            id: crypto.randomUUID(),
            type: 'tool_start',
            content: label,
            timestamp: Date.now(),
            toolMeta: { callId, tool, command: cmd },
          })

          setTelemetry((prev) => ({
            ...prev,
            actions: [...prev.actions, { timestamp: Date.now(), action: tool, detail: cmd }],
          }))
          break
        }

        case 'tool_log': {
          const text = d.text as string
          const callId = d.call_id as string
          if (!toolOutputIdRef.current) {
            const id = crypto.randomUUID()
            toolOutputIdRef.current = id
            addFeedItem({
              id,
              type: 'tool_output',
              content: text,
              timestamp: Date.now(),
              toolMeta: { callId, tool: 'bash' },
            })
          } else {
            updateFeedItem(toolOutputIdRef.current, (it) => ({ ...it, content: it.content + text }))
          }
          break
        }

        case 'tool_done': {
          const exitCode = d.exit_code as number
          const callId = d.call_id as string
          if (toolOutputIdRef.current) {
            updateFeedItem(toolOutputIdRef.current, (it) => ({
              ...it,
              toolMeta: { ...it.toolMeta!, callId, tool: it.toolMeta?.tool || 'bash', exitCode },
            }))
          }
          toolOutputIdRef.current = null
          break
        }

        case 'diff_proposal': {
          aiTextIdRef.current = null
          toolOutputIdRef.current = null
          addFeedItem({
            id: crypto.randomUUID(),
            type: 'diff_proposal',
            content: '',
            timestamp: Date.now(),
            diffMeta: {
              callId: d.call_id as string,
              filePath: d.file_path as string,
              oldContent: d.old as string,
              newContent: d.new as string,
              diff: d.diff as string,
              status: 'pending',
            },
          })
          break
        }

        case 'telemetry_update':
          setTelemetry((prev) => ({
            ...prev,
            agent: d.agent as string,
            state: d.state as string,
            tokensUsed: d.tokens_used as number,
            elapsedMs: d.elapsed_ms as number,
            iteration: d.iteration as number,
          }))
          break

        case 'error':
          addFeedItem({ id: crypto.randomUUID(), type: 'error', content: d.message as string, timestamp: Date.now() })
          break

        case 'done':
          addFeedItem({
            id: crypto.randomUUID(),
            type: 'info',
            content: `Done — ${(d.total_tokens as number)?.toLocaleString() ?? '?'} tokens, ${Math.round((d.total_time_ms as number) / 1000)}s`,
            timestamp: Date.now(),
          })
          break
      }
    }
  }, [activeModel, isRunning, addFeedItem, updateFeedItem])

  const handleStop = useCallback(async () => {
    if (sessionId) {
      try {
        await apiClient.terminal.stop(sessionId)
      } catch {
        // ignore
      }
    }
  }, [sessionId])

  // No model loaded
  if (!activeModel) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-white/5 flex items-center justify-center">
            <PanelRightOpen size={24} className="text-gray-600" />
          </div>
          <p className="text-sm text-gray-400">Load a model from the Models page to use the terminal.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">NanoCore Terminal</span>
          <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded font-mono">{activeModel.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {feedItems.length > 0 && !isRunning && (
            <button
              onClick={clearHistory}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
              title="Clear history"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={sidebarOpen ? 'Hide telemetry' : 'Show telemetry'}
          >
            {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <MessageFeed
            items={feedItems}
            sessionId={sessionId}
            onDiffDecided={handleDiffDecided}
          />
          <InputBar
            onSubmit={handleSubmit}
            onStop={handleStop}
            isRunning={isRunning}
          />
        </div>
        <TelemetrySidebar telemetry={telemetry} isOpen={sidebarOpen} />
      </div>
    </div>
  )
}
