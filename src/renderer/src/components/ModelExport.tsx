import { useState, useEffect } from 'react'
import { apiClient, cleanModelName } from '../api/client'
import type { ModelEntry } from '../api/client'
import { Card } from './ui/Card'
import { Package, Download, FolderOpen, Check, AlertCircle, Loader2 } from 'lucide-react'

type Precision = 0 | 4 | 8

const PRECISION_OPTIONS: { value: Precision; label: string; desc: string; color: string }[] = [
    { value: 4, label: '4-bit', desc: 'Smallest size, fast inference', color: 'green' },
    { value: 8, label: '8-bit', desc: 'Balanced size and quality', color: 'blue' },
    { value: 0, label: 'Full', desc: 'No quantization, original quality', color: 'purple' },
]

export function ModelExport() {
    const [adapters, setAdapters] = useState<ModelEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState('')
    const [qBits, setQBits] = useState<Precision>(4)
    const [outputPath, setOutputPath] = useState('')
    const [exporting, setExporting] = useState(false)
    const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    useEffect(() => {
        fetchAdapters()
    }, [])

    const fetchAdapters = async () => {
        setLoading(true)
        try {
            const list = await apiClient.engine.listAdapters()
            setAdapters(list)
            if (list.length > 0 && !selectedId) {
                setSelectedId(list[0].id)
            }
        } catch {
            setAdapters([])
        } finally {
            setLoading(false)
        }
    }

    const handleSelectOutput = async () => {
        try {
            const path = await (window as any).electronAPI?.selectDirectory?.()
            if (path) {
                const model = adapters.find(a => a.id === selectedId)
                const slug = model ? cleanModelName(model.name).replace(/\s+/g, '-').toLowerCase() : 'export'
                const suffix = qBits > 0 ? `${qBits}bit` : 'full'
                setOutputPath(`${path}/${slug}-${suffix}`)
            }
        } catch { /* ignore */ }
    }

    const handleExport = async () => {
        if (!selectedId || !outputPath) return
        setExporting(true)
        setResult(null)
        try {
            const res = await apiClient.engine.exportModel(selectedId, outputPath, qBits)
            setResult({ type: 'success', message: `Exported to ${res.path}` })
        } catch (err) {
            setResult({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
        } finally {
            setExporting(false)
        }
    }

    const selected = adapters.find(a => a.id === selectedId)

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Package size={20} className="text-blue-400" />
                <h2 className="text-lg font-bold text-white">Model Export</h2>
            </div>

            {loading ? (
                <Card className="p-8 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-gray-500" />
                </Card>
            ) : adapters.length === 0 ? (
                <Card className="p-8 text-center">
                    <Package size={32} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-sm text-gray-400">No fine-tuned models found.</p>
                    <p className="text-xs text-gray-600 mt-1">Train a model in the Fine-Tuning Engine first, then come back here to export it.</p>
                </Card>
            ) : (
                <>
                    {/* Model Selection */}
                    <Card className="p-5">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Select Model</label>
                        <div className="space-y-2">
                            {adapters.map(adapter => (
                                <button
                                    key={adapter.id}
                                    onClick={() => setSelectedId(adapter.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                                        selectedId === adapter.id
                                            ? 'bg-blue-500/10 border-blue-500/30 text-white'
                                            : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/10'
                                    }`}
                                >
                                    <Package size={16} className={selectedId === adapter.id ? 'text-blue-400' : 'text-gray-600'} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{cleanModelName(adapter.name)}</div>
                                        {adapter.base_model && (
                                            <div className="text-[10px] text-gray-600 truncate">Base: {adapter.base_model}</div>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-600">{adapter.size}</span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {/* Precision Selection */}
                    <Card className="p-5">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Precision</label>
                        <div className="grid grid-cols-3 gap-3">
                            {PRECISION_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setQBits(opt.value)}
                                    className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all ${
                                        qBits === opt.value
                                            ? `bg-${opt.color}-500/10 border-${opt.color}-500/30 text-white`
                                            : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="text-sm font-bold">{opt.label}</span>
                                    <span className="text-[10px] text-gray-500">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {/* Output Path + Export */}
                    <Card className="p-5">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Output</label>
                        <div className="flex gap-3">
                            <button
                                onClick={handleSelectOutput}
                                className={`flex-1 flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-all text-left ${
                                    outputPath
                                        ? 'bg-green-500/10 border-green-500/30 text-green-200'
                                        : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/5'
                                }`}
                            >
                                <span className="truncate">{outputPath || 'Select output folder...'}</span>
                                <FolderOpen size={16} className="opacity-50 shrink-0 ml-2" />
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={exporting || !outputPath || !selectedId}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-all disabled:opacity-50"
                            >
                                {exporting ? (
                                    <><Loader2 size={16} className="animate-spin" /> Exporting...</>
                                ) : (
                                    <><Download size={16} /> Export</>
                                )}
                            </button>
                        </div>

                        {selected && (
                            <div className="mt-3 text-xs text-gray-600">
                                Exporting <span className="text-gray-400">{cleanModelName(selected.name)}</span> at{' '}
                                <span className="text-gray-400">{qBits > 0 ? `${qBits}-bit` : 'full'} precision</span>
                            </div>
                        )}
                    </Card>

                    {/* Result */}
                    {result && (
                        <Card className={`p-4 flex items-center gap-3 ${result.type === 'success' ? 'border-green-500/30' : 'border-red-500/30'}`}>
                            {result.type === 'success' ? (
                                <Check size={16} className="text-green-400 shrink-0" />
                            ) : (
                                <AlertCircle size={16} className="text-red-400 shrink-0" />
                            )}
                            <span className={`text-sm ${result.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                                {result.message}
                            </span>
                        </Card>
                    )}
                </>
            )}
        </div>
    )
}
