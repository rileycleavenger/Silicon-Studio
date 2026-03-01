import { useRef, useEffect, memo, useCallback } from 'react'
import { User, Bot, TerminalSquare, AlertCircle, Info } from 'lucide-react'
import { StreamingMarkdown } from './StreamingMarkdown'
import { HolographicDiff } from './HolographicDiff'
import type { FeedItem } from './types'

interface MessageFeedProps {
  items: FeedItem[]
  sessionId: string
  onDiffDecided: (callId: string, approved: boolean, reason?: string) => void
}

/**
 * Memoized individual feed item — only re-renders when the item itself changes.
 * This prevents every item from re-rendering when a new token is appended
 * to the currently-streaming item.
 */
const FeedItemView = memo(function FeedItemView({
  item,
  sessionId,
  onDiffDecided,
}: {
  item: FeedItem
  sessionId: string
  onDiffDecided: (callId: string, approved: boolean, reason?: string) => void
}) {
  switch (item.type) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className="flex items-start gap-2 max-w-[80%]">
            <div className="bg-blue-600/20 border border-blue-500/20 rounded-lg px-3 py-2 text-sm text-white select-text">
              {item.content}
            </div>
            <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
              <User size={14} className="text-gray-400" />
            </div>
          </div>
        </div>
      )

    case 'ai_text':
      return (
        <div className="flex items-start gap-2 max-w-[85%]">
          <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={14} className="text-blue-400" />
          </div>
          <div className="prose prose-invert prose-sm max-w-none text-sm text-gray-200 select-text">
            <StreamingMarkdown content={item.content} />
          </div>
        </div>
      )

    case 'tool_start':
      return (
        <div className="flex items-center gap-2 px-2">
          <TerminalSquare size={12} className="text-yellow-500 shrink-0" />
          <span className="text-xs text-yellow-500/80 font-mono">{item.content}</span>
        </div>
      )

    case 'tool_output':
      return (
        <div className="mx-2">
          <pre className="bg-green-500/5 border border-green-500/10 rounded-lg px-3 py-2 text-xs text-green-300/80 font-mono overflow-x-auto max-h-60 select-text whitespace-pre-wrap">
            {item.content}
          </pre>
          {item.toolMeta?.exitCode !== undefined && item.toolMeta.exitCode !== 0 && (
            <span className="text-[10px] text-red-400 ml-1">exit code: {item.toolMeta.exitCode}</span>
          )}
        </div>
      )

    case 'diff_proposal':
      return item.diffMeta ? (
        <div className="mx-2">
          <HolographicDiff
            meta={item.diffMeta}
            sessionId={sessionId}
            onDecided={onDiffDecided}
          />
        </div>
      ) : null

    case 'error':
      return (
        <div className="flex items-start gap-2 mx-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <span className="text-sm text-red-300">{item.content}</span>
        </div>
      )

    case 'info':
      return (
        <div className="flex items-center gap-2 px-2">
          <Info size={12} className="text-gray-500 shrink-0" />
          <span className="text-xs text-gray-500">{item.content}</span>
        </div>
      )

    default:
      return null
  }
})

export function MessageFeed({ items, sessionId, onDiffDecided }: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Stable callback ref for onDiffDecided
  const onDiffDecidedRef = useRef(onDiffDecided)
  onDiffDecidedRef.current = onDiffDecided
  const stableDiffDecided = useCallback((callId: string, approved: boolean, reason?: string) => {
    onDiffDecidedRef.current(callId, approved, reason)
  }, [])

  // Auto-scroll: only if user is near the bottom (within 120px)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [items.length, items[items.length - 1]?.content])

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <TerminalSquare size={32} className="mx-auto text-gray-600" />
          <p className="text-sm text-gray-500">Ask NanoCore to run commands, edit files, or build something.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {items.map((item) => (
        <FeedItemView
          key={item.id}
          item={item}
          sessionId={sessionId}
          onDiffDecided={stableDiffDecided}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
