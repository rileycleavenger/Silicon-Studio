import { useState, useEffect } from 'react'
import { apiClient, cleanModelName, type PreviewRow } from '../api/client'
import { Card } from './ui/Card'
import { useToast } from './ui/Toast'
import { useGlobalState } from '../context/GlobalState'
import { Database, FileText, Server, Sparkles, MessageSquare, FolderOpen, Save } from 'lucide-react'

export function DataPreparation() {
    const { toast } = useToast()
    const [dataMode, setDataMode] = useState<'file' | 'mcp'>('file')

    // File Mode State
    const [filePath, setFilePath] = useState<string>("")
    const [fileName, setFileName] = useState<string>("")
    const [preview, setPreview] = useState<PreviewRow[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [columns, setColumns] = useState<string[]>([])
    const [instructionCol, setInstructionCol] = useState("")
    const [inputCol, setInputCol] = useState("")
    const [outputCol, setOutputCol] = useState("")
    const [outputPath, setOutputPath] = useState("")

    // MCP Mode State
    const { activeModel } = useGlobalState()
    const [mcpServer, setMcpServer] = useState("")
    const [mcpServers, setMcpServers] = useState<{ id: string; name: string }[]>([])
    const [mcpPrompt, setMcpPrompt] = useState("Generate question-answer pairs explaining how to use each tool exposed by this MCP server.")
    const [mcpGenerating, setMcpGenerating] = useState(false)

    // Fetch MCP servers when switching to MCP mode
    useEffect(() => {
        if (dataMode === 'mcp') {
            apiClient.mcp.listServers().then(servers => {
                setMcpServers(servers)
                if (servers.length > 0 && !mcpServer) {
                    setMcpServer(servers[0].id)
                }
            }).catch(() => setMcpServers([]))
        }
    }, [dataMode])

    const handleFileSelect = async () => {
        try {
            const path = await (window as any).electronAPI?.selectFile?.();
            if (path) {
                setFilePath(path);
                const name = path.split(/[/\\]/).pop() || path;
                setFileName(name);
                const defaultOut = path.replace(/\.csv$/i, '_train.jsonl');
                setOutputPath(defaultOut);
                setLoading(true);
                setError(null);

                const res = await apiClient.preparation.previewCsv(path);
                setPreview(res.data);

                if (res.data.length > 0) {
                    const cols = Object.keys(res.data[0]);
                    setColumns(cols);
                    setInstructionCol(cols.find(c => c.toLowerCase().includes('instruct') || c.toLowerCase().includes('prompt')) || cols[0] || "");
                    setInputCol(cols.find(c => c.toLowerCase().includes('input') || c.toLowerCase().includes('context')) || "");
                    setOutputCol(cols.find(c => c.toLowerCase().includes('output') || c.toLowerCase().includes('response') || c.toLowerCase().includes('answer')) || cols[cols.length - 1] || "");
                }
            }
        } catch (err: any) {
            setError("Failed to load file: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConvertFile = async () => {
        if (!filePath || !outputPath || !instructionCol || !outputCol) return
        setLoading(true)
        try {
            await apiClient.preparation.convertCsv(
                filePath,
                outputPath,
                instructionCol,
                inputCol || undefined,
                outputCol
            )
            toast(`Training data saved to: ${outputPath}`, 'success')
            setPreview([])
            setFilePath("")
            setFileName("")
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleGenerateMcp = async () => {
        if (!activeModel) {
            setError("You must load a 'Bridge Model' in the Models tab first to perform the extraction.");
            return;
        }
        if (!outputPath) {
            setError("Please select an Output Path for the generated JSONL.");
            return;
        }

        setMcpGenerating(true);
        setError(null);

        try {
            const res = await apiClient.preparation.generateMcp(
                activeModel.id,
                mcpServer,
                mcpPrompt,
                outputPath
            );

            setPreview(res.data);
            setColumns(["instruction", "output"]);
            setInstructionCol("instruction");
            setOutputCol("output");
            setInputCol("");
            toast(`Generated ${res.rows} rows via ${mcpServer} and saved to ${outputPath}`, 'success');
        } catch (err: any) {
            setError("Generation failed: " + err.message);
        } finally {
            setMcpGenerating(false);
        }
    }

    return (
        <div className="h-full flex flex-col space-y-4 text-white">

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex justify-between items-center transition-all">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-white/40 hover:text-white">✕</button>
                </div>
            )}

            {/* Top Navigation Tabs */}
            <div className="flex gap-6 border-b border-white/10 px-1">
                <button
                    onClick={() => { setDataMode('file'); setPreview([]); }}
                    className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${dataMode === 'file' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    <FileText className="w-4 h-4" /> Import from File
                    {dataMode === 'file' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
                <button
                    onClick={() => { setDataMode('mcp'); setPreview([]); }}
                    className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${dataMode === 'mcp' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    <Server className="w-4 h-4" /> Generate via MCP
                    {dataMode === 'mcp' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
            </div>

            <Card className="p-5">
                {dataMode === 'file' ? (
                    // --- FILE MODE CONFIGURATION ---
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        <div className="flex flex-col space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase">Input Dataset (CSV)</label>
                            <button
                                onClick={handleFileSelect}
                                className={`flex items-center justify-between px-3 h-10 rounded-lg border text-[13px] font-medium transition-all text-left ${fileName
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                                    : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                                    }`}
                            >
                                <span className="truncate">{fileName || "Select File..."}</span>
                                <FolderOpen className="w-4 h-4 opacity-50" />
                            </button>
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase">Output Path (JSONL)</label>
                            <button
                                onClick={async () => {
                                    const path = await (window as any).electronAPI?.selectDirectory?.();
                                    if (path) setOutputPath(path + "/" + (fileName ? fileName.replace('.csv', '_train.jsonl') : 'train.jsonl'));
                                }}
                                className={`flex items-center justify-between px-3 h-10 rounded-lg border text-[13px] font-medium transition-all text-left ${outputPath
                                    ? 'bg-green-500/10 border-green-500/30 text-green-200'
                                    : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                title={outputPath}
                            >
                                <span className="truncate">{outputPath ? "..." + outputPath.slice(-25) : "Select Folder..."}</span>
                                <Save className="w-4 h-4 opacity-50" />
                            </button>
                        </div>
                    </div>
                ) : (
                    // --- MCP MODE CONFIGURATION ---
                    <div className="flex flex-col space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">Active MCP Server</label>
                                <div className="relative">
                                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                                    <select
                                        value={mcpServer}
                                        onChange={(e) => setMcpServer(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
                                    >
                                        {mcpServers.length === 0 && (
                                            <option value="">No servers configured — add in Settings</option>
                                        )}
                                        {mcpServers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">Bridge Model (Generator)</label>
                                <div className={`flex items-center px-3 py-2.5 rounded-lg border text-sm text-left ${activeModel ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' : 'bg-black/40 border-red-500/30 text-red-400'}`}>
                                    {activeModel ? (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            <span className="truncate">{cleanModelName(activeModel.name)}</span>
                                        </>
                                    ) : (
                                        "No Model Loaded in Memory (Go to Models)"
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col space-y-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase">Output Path (JSONL)</label>
                                <button
                                    onClick={async () => {
                                        const path = await (window as any).electronAPI?.selectDirectory?.();
                                        if (path) setOutputPath(path + "/mcp_generated_train.jsonl");
                                    }}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all text-left ${outputPath
                                        ? 'bg-green-500/10 border-green-500/30 text-green-200'
                                        : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/5'
                                        }`}
                                    title={outputPath}
                                >
                                    <span className="truncate">{outputPath ? "..." + outputPath.slice(-25) : "Select Folder..."}</span>
                                    <Save className="w-4 h-4 opacity-50" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase">System Prompt / Goal</label>
                            <div className="relative">
                                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                                <textarea
                                    value={mcpPrompt}
                                    onChange={(e) => setMcpPrompt(e.target.value)}
                                    rows={3}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white outline-none focus:border-blue-500 text-sm resize-none"
                                    placeholder="Tell the Bridge Model what kind of Instruction/Output pairs to generate from the MCP server..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={handleGenerateMcp}
                                disabled={mcpGenerating || !outputPath || !activeModel}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-6 rounded-lg transition-all text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {mcpGenerating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Generating via MCP...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Start Generation
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Card>

            {/* PREVIEW & MAPPING AREA (Visible when file selected or MCP payload returned) */}
            {preview.length > 0 ? (
                <Card className="flex-1 flex flex-col gap-4 overflow-hidden p-0 bg-transparent shadow-none border-none">
                    {/* Column Mapping Bar (Only relevant for File mode mostly, but kept for MCP sanity checks) */}
                    <div className="bg-black/20 border border-white/10 rounded-xl p-3 flex flex-wrap items-center gap-4">
                        <span className="text-xs font-bold text-gray-500 uppercase mr-2">Map Columns:</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-blue-300">Instruction:</span>
                            <select value={instructionCol} onChange={(e) => setInstructionCol(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Input (Opt):</span>
                            <select value={inputCol} onChange={(e) => setInputCol(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                                <option value="">(None)</option>
                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-green-300">Output:</span>
                            <select value={outputCol} onChange={(e) => setOutputCol(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex-1"></div>
                        {dataMode === 'file' && (
                            <button
                                onClick={handleConvertFile}
                                disabled={loading || !outputPath}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-4 rounded-lg transition-all text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? 'Processing...' : 'Save JSONL'}
                                {!loading && <Sparkles className="w-3.5 h-3.5" />}
                            </button>
                        )}
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-[#0E0E10]">
                        <table className="w-full text-left text-sm text-gray-400 border-separate border-spacing-0">
                            <thead className="bg-[#18181B] text-gray-500 uppercase font-bold text-[10px] tracking-wide sticky top-0 z-20">
                                <tr>
                                    <th className="px-4 py-3 bg-[#18181B] border-b border-white/10 w-12 text-center">#</th>
                                    {columns.map(header => (
                                        <th key={header} className={`px-4 py-3 bg-[#18181B] border-b border-white/10 whitespace-nowrap ${header === instructionCol ? 'text-blue-400 shadow-[inset_0_-2px_0_#3b82f6]' : header === outputCol ? 'text-green-400 shadow-[inset_0_-2px_0_#22c55e]' : header === inputCol ? 'text-indigo-400 shadow-[inset_0_-2px_0_#6366f1]' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                {header}
                                                {header === instructionCol && <span className="text-[8px] bg-blue-500/20 px-1 rounded">PROMPT</span>}
                                                {header === outputCol && <span className="text-[8px] bg-green-500/20 px-1 rounded">REPLY</span>}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {preview.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-4 py-3 text-[11px] font-mono text-gray-600 bg-black/20 text-center border-r border-white/5">{idx + 1}</td>
                                        {columns.map((col, cIdx) => (
                                            <td key={cIdx} className={`px-4 py-3 text-[13px] border-r border-white/5 last:border-0 max-w-sm transition-opacity ${(!instructionCol || !outputCol) ? 'opacity-100' : (col === instructionCol || col === outputCol || col === inputCol) ? 'opacity-100 font-medium' : 'opacity-30 group-hover:opacity-60'}`} title={String(row[col])}>
                                                <div className="line-clamp-2 leading-relaxed">
                                                    {String(row[col])}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-white/20 rounded-2xl bg-black/20 hover:bg-black/40 transition-all cursor-pointer group">
                    <div className="w-16 h-16 bg-[#18181B] rounded-2xl flex items-center justify-center mb-4 border border-white/5 group-hover:scale-105 transition-transform">
                        {dataMode === 'file' ? <FileText className="w-8 h-8 text-blue-400/80 group-hover:text-blue-400" /> : <Server className="w-8 h-8 text-blue-400/80 group-hover:text-blue-400" />}
                    </div>
                    <p className="text-gray-300 font-bold tracking-wide">
                        {dataMode === 'file' ? "Select a CSV dataset to begin" : "Configure MCP and Model to generate Data"}
                    </p>
                    <p className="text-gray-500 text-[13px] mt-2 max-w-md text-center leading-relaxed">
                        {dataMode === 'file'
                            ? "Configure your settings above, map your columns, and generate a clean JSONL file for training."
                            : "The generator will utilize the selected MCP server context and the bridge model to automatically output Fine-Tuning rows."}
                    </p>
                </div>
            )}
        </div>
    )
}
