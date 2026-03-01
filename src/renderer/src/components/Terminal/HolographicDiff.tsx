import { useState } from 'react'
import { Check, X, Send } from 'lucide-react'
import { apiClient } from '../../api/client'
import type { DiffMetadata } from './types'

interface HolographicDiffProps {
  meta: DiffMetadata
  sessionId: string
  onDecided: (callId: string, approved: boolean, reason?: string) => void
}

export function HolographicDiff({ meta, sessionId, onDecided }: HolographicDiffProps) {
  const [deciding, setDeciding] = useState(false)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const isPending = meta.status === 'pending'

  const handleDecide = async (approved: boolean, reason: string = '') => {
    if (deciding) return
    setDeciding(true)
    try {
      await apiClient.terminal.decideDiff(sessionId, meta.callId, approved, reason)
      onDecided(meta.callId, approved, reason)
    } catch {
      onDecided(meta.callId, approved, reason)
    } finally {
      setDeciding(false)
      setShowRejectInput(false)
    }
  }

  const handleRejectClick = () => {
    setShowRejectInput(true)
  }

  const handleRejectSubmit = () => {
    handleDecide(false, rejectReason.trim())
  }

  const handleRejectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRejectSubmit()
    }
    if (e.key === 'Escape') {
      setShowRejectInput(false)
      setRejectReason('')
    }
  }

  // Parse diff lines for coloring
  const diffLines = meta.diff.split('\n')

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isPending
        ? 'border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
        : meta.status === 'approved'
          ? 'border-green-500/30'
          : 'border-red-500/30'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/5">
        <span className="text-xs text-gray-400 font-mono truncate">{meta.filePath}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isPending && !showRejectInput ? (
            <>
              <button
                onClick={() => handleDecide(true)}
                disabled={deciding}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-green-600/80 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
              >
                <Check size={12} /> Approve
              </button>
              <button
                onClick={handleRejectClick}
                disabled={deciding}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                <X size={12} /> Reject
              </button>
            </>
          ) : isPending && showRejectInput ? null : (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
              meta.status === 'approved' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {meta.status === 'approved' ? 'Approved' : 'Rejected'}
            </span>
          )}
        </div>
      </div>

      {/* Reject reason input */}
      {showRejectInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border-b border-red-500/10">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            onKeyDown={handleRejectKeyDown}
            placeholder="Why are you rejecting? (optional, Enter to send)"
            autoFocus
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50"
          />
          <button
            onClick={handleRejectSubmit}
            disabled={deciding}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors disabled:opacity-50 shrink-0"
          >
            <Send size={10} /> Send
          </button>
          <button
            onClick={() => { setShowRejectInput(false); setRejectReason('') }}
            className="px-1.5 py-1 text-[11px] text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Reject reason display (after decision) */}
      {meta.status === 'rejected' && meta.rejectReason && (
        <div className="px-3 py-1.5 bg-red-500/5 border-b border-red-500/10">
          <span className="text-[11px] text-red-400/70">Reason: {meta.rejectReason}</span>
        </div>
      )}

      {/* Diff view */}
      <div className="overflow-x-auto max-h-80">
        <pre className="text-[12px] leading-5 font-mono p-0 m-0 select-text">
          {diffLines.map((line, i) => {
            let bg = ''
            let textColor = 'text-gray-400'
            if (line.startsWith('+') && !line.startsWith('+++')) {
              bg = 'bg-green-500/10'
              textColor = 'text-green-400'
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              bg = 'bg-red-500/10'
              textColor = 'text-red-400'
            } else if (line.startsWith('@@')) {
              textColor = 'text-blue-400'
            }
            return (
              <div key={i} className={`px-3 ${bg} ${textColor}`}>
                {line || ' '}
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
