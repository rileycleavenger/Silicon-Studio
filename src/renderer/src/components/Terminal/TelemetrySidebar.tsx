import { Clock, Cpu, Hash, Activity } from 'lucide-react'
import type { TelemetryData } from './types'

interface TelemetrySidebarProps {
  telemetry: TelemetryData
  isOpen: boolean
}

const STATE_COLORS: Record<string, string> = {
  thinking: 'bg-green-400',
  tool_calling: 'bg-yellow-400',
  waiting_human_approval: 'bg-blue-400 animate-pulse',
  done: 'bg-gray-500',
  error: 'bg-red-500',
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function TelemetrySidebar({ telemetry, isOpen }: TelemetrySidebarProps) {
  if (!isOpen) return null

  const dotColor = STATE_COLORS[telemetry.state] || 'bg-gray-500'

  return (
    <div className="w-64 border-l border-white/5 bg-white/[0.02] flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-xs font-medium text-white capitalize">{telemetry.agent || 'agent'}</span>
          <span className="text-[10px] text-gray-500 ml-auto">{telemetry.state.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-3 space-y-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Cpu size={12} className="shrink-0 text-gray-500" />
          <span>Tokens</span>
          <span className="ml-auto text-white font-mono">{telemetry.tokensUsed.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock size={12} className="shrink-0 text-gray-500" />
          <span>Elapsed</span>
          <span className="ml-auto text-white font-mono">{formatMs(telemetry.elapsedMs)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Hash size={12} className="shrink-0 text-gray-500" />
          <span>Iteration</span>
          <span className="ml-auto text-white font-mono">{telemetry.iteration}</span>
        </div>
      </div>

      {/* Action timeline */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={12} className="text-gray-500" />
          <span className="text-[10px] font-bold tracking-wide text-gray-500 uppercase">Timeline</span>
        </div>
        {telemetry.actions.length === 0 ? (
          <p className="text-[11px] text-gray-600">No actions yet</p>
        ) : (
          <div className="space-y-1">
            {telemetry.actions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-gray-300 font-medium">{a.action}</span>
                  {a.detail && <span className="text-gray-500 ml-1 truncate">{a.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
