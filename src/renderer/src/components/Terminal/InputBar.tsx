import { useState, useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'

interface InputBarProps {
  onSubmit: (prompt: string) => void
  onStop: () => void
  isRunning: boolean
  disabled?: boolean
}

export function InputBar({ onSubmit, onStop, isRunning, disabled }: InputBarProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isRunning || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-white/5 bg-white/[0.02] px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Load a model first...' : 'Ask NanoCore to do something...'}
          disabled={disabled || isRunning}
          rows={1}
          className="flex-1 resize-none bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 disabled:opacity-50 select-text"
        />
        {isRunning ? (
          <button
            onClick={onStop}
            className="shrink-0 px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Square size={14} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Send size={14} />
            Send
          </button>
        )}
      </div>
    </div>
  )
}
