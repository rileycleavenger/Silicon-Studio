import { useState, useEffect, useRef } from 'react'
import { Server, Copy, Check, Globe, ChevronRight, Terminal } from 'lucide-react'
import { useGlobalState } from '../context/GlobalState'
import { apiClient, cleanModelName } from '../api/client'

interface LogEntry {
    timestamp: number
    source: string
    message: string
}

export function Deployment() {
    const { activeModel } = useGlobalState()
    const [serverRunning, setServerRunning] = useState(false)
    const [host, setHost] = useState('127.0.0.1')
    const [port, setPort] = useState('8080')
    const [errorMsg, setErrorMsg] = useState('')
    const [loading, setLoading] = useState(false)
    const [uptime, setUptime] = useState<number | null>(null)
    const [pid, setPid] = useState<number | null>(null)

    // Logs
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [logSince, setLogSince] = useState(0)
    const logEndRef = useRef<HTMLDivElement>(null)
    const [autoScroll, setAutoScroll] = useState(true)

    // Copy state per snippet
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // Collapsible snippets
    const [showSnippets, setShowSnippets] = useState(false)

    // Poll server status
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await apiClient.deployment.getStatus()
                setServerRunning(status.running)
                setUptime(status.uptime_seconds ?? null)
                setPid(status.pid ?? null)
            } catch {
                // status check failed silently
            }
        }
        checkStatus()
        const interval = setInterval(checkStatus, 3000)
        return () => clearInterval(interval)
    }, [])

    // Poll logs when server is running
    const logSinceRef = useRef(logSince)
    logSinceRef.current = logSince
    useEffect(() => {
        if (!serverRunning) return
        const fetchLogs = async () => {
            try {
                const data = await apiClient.deployment.getLogs(logSinceRef.current)
                if (data.logs.length > 0) {
                    setLogs(prev => {
                        const merged = [...prev, ...data.logs];
                        return merged.length > 500 ? merged.slice(-500) : merged;
                    })
                    setLogSince(data.logs[data.logs.length - 1].timestamp)
                }
            } catch {
                // ignore log fetch errors
            }
        }
        fetchLogs()
        const interval = setInterval(fetchLogs, 1500)
        return () => clearInterval(interval)
    }, [serverRunning])

    // Auto-scroll logs
    useEffect(() => {
        if (autoScroll) {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [logs, autoScroll])

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const toggleServer = async () => {
        setErrorMsg('')
        if (serverRunning) {
            setLoading(true)
            try {
                await apiClient.deployment.stop()
                setServerRunning(false)
                setPid(null)
            } catch (e: any) {
                setErrorMsg(e.message)
            } finally {
                setLoading(false)
            }
        } else {
            if (!activeModel) {
                setErrorMsg("No active model loaded. Select a model in the Models tab first.")
                return
            }
            if (!activeModel.path) {
                setErrorMsg("Active model does not have a valid local path.")
                return
            }

            setLoading(true)
            setLogs([])
            setLogSince(0)
            try {
                await apiClient.deployment.start(activeModel.path, host, parseInt(port))
                setServerRunning(true)
            } catch (e: any) {
                setErrorMsg(e.message)
            } finally {
                setLoading(false)
            }
        }
    }

    const formatUptime = (s: number) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        if (h > 0) return `${h}h ${m}m ${sec}s`
        if (m > 0) return `${m}m ${sec}s`
        return `${sec}s`
    }

    const formatLogTime = (ts: number) => {
        const d = new Date(ts * 1000)
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    const endpoint = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

    const curlSnippet = `curl ${endpoint}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "local-model",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`

    const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${endpoint}/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="local-model",
    messages=[
        {"role": "user", "content": "Write a haiku about local AI."}
    ]
)

print(response.choices[0].message.content)`

    return (
        <div className="h-full flex flex-col text-white overflow-hidden pb-4">

            <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-4">

                {/* Top bar: controls + config */}
                <div className="shrink-0 flex flex-col gap-3 px-1">

                    {/* Server control row */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleServer}
                            disabled={loading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${serverRunning
                                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                                }`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Server className="w-4 h-4" />
                            )}
                            {serverRunning ? 'Stop Server' : 'Start Server'}
                        </button>

                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${serverRunning ? 'bg-green-500' : 'bg-gray-600'}`} />
                            <span className="text-xs text-gray-400">
                                {serverRunning ? 'Running' : 'Stopped'}
                            </span>
                        </div>

                        {serverRunning && uptime != null && (
                            <span className="text-xs text-gray-500 font-mono tabular-nums">
                                {formatUptime(uptime)}
                            </span>
                        )}

                        {serverRunning && pid && (
                            <span className="text-xs text-gray-600 font-mono">
                                PID {pid}
                            </span>
                        )}

                        <div className="ml-auto flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-gray-600" />
                                <select
                                    title="Bind address"
                                    value={host}
                                    onChange={(e) => setHost(e.target.value)}
                                    disabled={serverRunning}
                                    className="bg-transparent text-xs text-gray-400 outline-none cursor-pointer hover:text-gray-300 disabled:opacity-50"
                                >
                                    <option value="127.0.0.1" className="bg-[#18181B]">localhost</option>
                                    <option value="0.0.0.0" className="bg-[#18181B]">0.0.0.0</option>
                                </select>
                            </div>
                            <span className="text-gray-700">:</span>
                            <input
                                type="number"
                                title="Port"
                                disabled={serverRunning}
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                                className="w-16 bg-transparent border-b border-white/10 text-xs text-gray-400 outline-none focus:border-white/30 disabled:opacity-50 font-mono text-center"
                            />
                        </div>
                    </div>

                    {/* Error message */}
                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-xs">
                            {errorMsg}
                        </div>
                    )}

                    {/* Endpoint URL when running */}
                    {serverRunning && (
                        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                            <span className="text-xs text-gray-500">Endpoint</span>
                            <code className="text-xs font-mono text-gray-300 flex-1">{endpoint}/v1</code>
                            <button
                                onClick={() => handleCopy(`${endpoint}/v1`, 'endpoint')}
                                className="text-gray-600 hover:text-gray-400 transition-colors"
                                title="Copy endpoint URL"
                            >
                                {copiedId === 'endpoint' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <div className="w-px h-4 bg-white/5 mx-1" />
                            <span className="text-xs text-gray-500">Model</span>
                            <span className="text-xs text-gray-400 font-mono truncate max-w-48">
                                {activeModel ? cleanModelName(activeModel.name) : 'none'}
                            </span>
                        </div>
                    )}

                    {/* Collapsible code snippets */}
                    <details
                        open={showSnippets}
                        onToggle={(e) => setShowSnippets((e.target as HTMLDetailsElement).open)}
                    >
                        <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 hover:text-gray-400 transition-colors select-none py-1">
                            <ChevronRight className={`w-3 h-3 transition-transform ${showSnippets ? 'rotate-90' : ''}`} />
                            <span>Integration snippets</span>
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                            <SnippetBlock
                                label="cURL"
                                code={curlSnippet}
                                copied={copiedId === 'curl'}
                                onCopy={() => handleCopy(curlSnippet, 'curl')}
                            />
                            <SnippetBlock
                                label="Python (OpenAI SDK)"
                                code={pythonSnippet}
                                copied={copiedId === 'python'}
                                onCopy={() => handleCopy(pythonSnippet, 'python')}
                            />
                        </div>
                    </details>
                </div>

                {/* Log panel — takes remaining space */}
                <div className="flex-1 flex flex-col bg-black/30 border border-white/5 rounded-xl overflow-hidden min-h-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02] shrink-0">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs font-medium text-gray-400">Server Log</span>
                            <span className="text-[10px] text-gray-600 font-mono">{logs.length} entries</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoScroll}
                                    onChange={(e) => setAutoScroll(e.target.checked)}
                                    className="accent-white/50"
                                />
                                Auto-scroll
                            </label>
                            {logs.length > 0 && (
                                <button
                                    onClick={() => { setLogs([]); setLogSince(0); }}
                                    className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto font-mono text-xs p-3 space-y-0">
                        {logs.length === 0 ? (
                            <div className="h-full flex items-center justify-center">
                                <p className="text-gray-600 text-xs">
                                    {serverRunning ? 'Waiting for log output...' : 'Start the server to see logs here.'}
                                </p>
                            </div>
                        ) : (
                            logs.map((entry, i) => (
                                <div key={i} className="flex gap-3 py-0.5 hover:bg-white/[0.02] px-1 rounded">
                                    <span className="text-gray-600 tabular-nums shrink-0">{formatLogTime(entry.timestamp)}</span>
                                    <span className={`shrink-0 w-12 text-right ${entry.source === 'stderr' ? 'text-yellow-600' : 'text-gray-600'}`}>
                                        {entry.source === 'stderr' ? 'err' : 'out'}
                                    </span>
                                    <span className="text-gray-400 break-all">{entry.message}</span>
                                </div>
                            ))
                        )}
                        <div ref={logEndRef} />
                    </div>
                </div>

            </div>
        </div>
    )
}

function SnippetBlock({ label, code, copied, onCopy }: {
    label: string
    code: string
    copied: boolean
    onCopy: () => void
}) {
    return (
        <div className="rounded-lg border border-white/5 bg-black/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/5">
                <span className="text-[10px] font-mono text-gray-500">{label}</span>
                <button
                    onClick={onCopy}
                    title={`Copy ${label} snippet`}
                    className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>
            <pre className="p-3 text-[11px] font-mono text-blue-300/80 overflow-x-auto max-h-48 overflow-y-auto">
                {code}
            </pre>
        </div>
    )
}
