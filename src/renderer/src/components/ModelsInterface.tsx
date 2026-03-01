import { useState, useEffect } from 'react';
import { apiClient, cleanModelName } from '../api/client';
import type { ModelEntry } from '../api/client';
import { PageHeader } from './ui/PageHeader';
import { useToast } from './ui/Toast';
import { Search, Download, Trash2, Database, HardDrive, FileText, Play, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useGlobalState } from '../context/GlobalState';

export function ModelsInterface() {
    const { toast } = useToast();
    const [models, setModels] = useState<ModelEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'my-models' | 'discover'>('my-models');
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const { setActiveModel, activeModel } = useGlobalState();

    // Split-view State
    const [selectedModel, setSelectedModel] = useState<ModelEntry | null>(null);
    const [readmeContent, setReadmeContent] = useState<string>("Select a model to view details.");
    const [readmeLoading, setReadmeLoading] = useState(false);

    // Custom Model State
    const [showAddModal, setShowAddModal] = useState(false);
    const [customName, setCustomName] = useState("");
    const [customPath, setCustomPath] = useState("");
    const [foundModels, setFoundModels] = useState<ModelEntry[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [scanning, setScanning] = useState(false);

    // Filtering
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetchModels();
        const interval = setInterval(() => {
            fetchModels(true)
        }, 5000)
        return () => clearInterval(interval)
    }, []);

    const fetchModels = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await apiClient.engine.getModels();
            setModels(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleDownload = async (modelId: string) => {
        try {
            setDownloading(prev => new Set(prev).add(modelId));
            await apiClient.engine.downloadModel(modelId);
        } catch (err: any) {
            toast(`Failed to start download: ${err.message}`, 'error');
            setDownloading(prev => {
                const next = new Set(prev);
                next.delete(modelId);
                return next;
            });
        }
    };

    const handleDelete = async (modelId: string) => {
        try {
            setLoading(true);
            await apiClient.engine.deleteModel(modelId);
            await fetchModels();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const parseContextWindow = (cw: string | undefined): number | undefined => {
        if (!cw || cw === "Unknown") return undefined;
        const match = cw.match(/^(\d+)k$/i);
        if (match) return parseInt(match[1], 10) * 1024;
        const num = parseInt(cw, 10);
        return isNaN(num) ? undefined : num;
    };

    const loadModelIntoMemory = async (model: ModelEntry) => {
        try {
            const result = await apiClient.engine.loadModel(model.id);
            setActiveModel({
                id: model.id,
                name: cleanModelName(model.name),
                size: model.size,
                path: model.local_path || model.id,
                architecture: model.architecture,
                context_window: result.context_window ?? parseContextWindow(model.context_window),
            });
        } catch (e: any) {
            toast(`Failed to load model: ${e.message}`, 'error');
        }
    };

    const fetchReadme = async (id: string) => {
        setReadmeLoading(true);
        try {
            if (id.startsWith('mlx-community/') || id.includes('/')) {
                const response = await fetch(`https://huggingface.co/${id}/raw/main/README.md`);
                if (response.ok) {
                    const text = await response.text();
                    setReadmeContent(text);
                } else {
                    setReadmeContent("README not found or model is private.");
                }
            } else {
                setReadmeContent("No README available for custom local models.");
            }
        } catch (e) {
            setReadmeContent("Unable to fetch README. Check your internet connection.");
        } finally {
            setReadmeLoading(false);
        }
    };

    const selectModelForDetails = (model: ModelEntry) => {
        setSelectedModel(model);
        fetchReadme(model.id);
    };

    const handleScan = async (path: string) => {
        if (!path) return;
        setScanning(true);
        setError(null);
        try {
            const found = await apiClient.engine.scanModels(path);
            setFoundModels(found);
            setSelectedPaths(new Set(found.map(m => m.path || m.local_path).filter((p): p is string => p !== null)));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setScanning(false);
        }
    };

    const handleRegister = async () => {
        if (foundModels.length > 0) {
            if (selectedPaths.size === 0) return;
            try {
                setLoading(true);
                // Register one by one for the selected ones
                for (const path of Array.from(selectedPaths)) {
                    await apiClient.engine.registerModel(customName, path, "");
                }
                await fetchModels();
                resetAddModal();
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        } else {
            if (!customName || !customPath) return;
            try {
                setLoading(true);
                await apiClient.engine.registerModel(customName, customPath, "");
                await fetchModels();
                resetAddModal();
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
    }

    const resetAddModal = () => {
        setShowAddModal(false);
        setCustomName("");
        setCustomPath("");
        setFoundModels([]);
        setSelectedPaths(new Set());
    }

    const togglePathSelection = (path: string) => {
        const next = new Set(selectedPaths);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setSelectedPaths(next);
    };

    // Filter Logic
    const downloadedModels = models.filter(m => m.downloaded || downloading.has(m.id) || m.is_custom);
    const discoverableModels = models.filter(m => !m.is_custom && !m.downloaded && !downloading.has(m.id));

    const displayedMyModels = downloadedModels.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayedDiscoverModels = discoverableModels.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Helper to extract Quantization from name
    const guessQuant = (name: string) => {
        if (name.toLowerCase().includes('4-bit') || name.toLowerCase().includes('4bit')) return '4-bit';
        if (name.toLowerCase().includes('8-bit') || name.toLowerCase().includes('8bit')) return '8-bit';
        if (name.toLowerCase().includes('bf16')) return 'BF16';
        if (name.toLowerCase().includes('fp16')) return 'FP16';
        return 'Standard';
    };

    const guessPublisher = (id: string) => {
        return id.split('/')[0] || '-';
    };

    return (
        <div className="h-full flex flex-col text-white overflow-hidden pb-4">
            <PageHeader>
                <button
                    onClick={() => { resetAddModal(); setShowAddModal(true); }}
                    className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/5 whitespace-nowrap"
                >
                    + Add Local Folder
                </button>
            </PageHeader>

            {/* Tabs */}
            <div className="flex gap-6 mb-6 border-b border-white/10 px-1">
                <button
                    onClick={() => setActiveTab('my-models')}
                    className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'my-models' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    My Models ({downloadedModels.length})
                    {activeTab === 'my-models' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('discover')}
                    className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'discover' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                    Discover (HuggingFace)
                    {activeTab === 'discover' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
            </div>

            {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-white/40 hover:text-white">✕</button>
                </div>
            )}

            <div className="flex-1 overflow-hidden min-h-0 relative">

                {/* --- MY MODELS VIEW (Data Table) --- */}
                {activeTab === 'my-models' && (
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search local models..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white outline-none focus:border-blue-500 text-sm transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/20">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-[#18181B] text-gray-400 border-b border-white/10 uppercase text-[11px] tracking-wide">
                                    <tr>
                                        <th className="px-5 py-3 font-semibold w-[30%]">Name / ID</th>
                                        <th className="px-5 py-3 font-semibold">Arch</th>
                                        <th className="px-5 py-3 font-semibold">Context</th>
                                        <th className="px-5 py-3 font-semibold">Quant</th>
                                        <th className="px-5 py-3 font-semibold">Size</th>
                                        <th className="px-5 py-3 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {displayedMyModels.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-12 text-gray-500">
                                                No models found locally. Click "Discover" to download some!
                                            </td>
                                        </tr>
                                    ) : (
                                        displayedMyModels.map((model) => (
                                            <tr key={model.id} className="hover:bg-white/[0.04] transition-colors group">
                                                <td className="px-5 py-3.5 align-middle">
                                                    <div className="flex items-center gap-3.5">
                                                        <div className="w-8 h-8 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                                            <Database className="w-4 h-4 text-blue-400 opacity-90" />
                                                        </div>
                                                        <div className="flex flex-col justify-center">
                                                            <div className="font-semibold text-white/90 flex items-center gap-2 text-[13px] leading-tight">
                                                                {cleanModelName(model.name)}
                                                                {model.is_finetuned && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/20 uppercase tracking-wide font-bold">Fine-Tuned</span>}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500 font-mono mt-0.5 truncate max-w-[220px]" title={model.id}>{model.id}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 align-middle">
                                                    <span className="text-[11px] font-medium text-gray-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                                        {model.architecture || 'Unknown'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 align-middle font-mono text-gray-400 text-[12px]">
                                                    {model.context_window || '-'}
                                                </td>
                                                <td className="px-5 py-3.5 align-middle">
                                                    <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                                                        {model.quantization || guessQuant(model.name)}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 align-middle font-mono text-gray-400 text-[12px]">
                                                    {model.size && model.size !== '0.00GB' ? model.size : (model.is_custom ? 'Calculating...' : 'Unknown')}
                                                </td>
                                                <td className="px-5 py-3.5 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {activeModel?.id === model.id ? (
                                                            <div className="flex bg-green-500/10 border border-green-500/20 rounded h-7 overflow-hidden">
                                                                <div className="px-2.5 flex items-center gap-1.5 text-green-400 text-[11px] font-bold tracking-wide uppercase border-r border-green-500/20">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                                    Active
                                                                </div>
                                                                <button
                                                                    onClick={() => setActiveModel(null)}
                                                                    className="px-2.5 text-[11px] font-bold tracking-wide uppercase text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center gap-1.5"
                                                                    title="Eject Model"
                                                                >
                                                                    <LogOut className="w-3 h-3" /> Eject
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => loadModelIntoMemory(model)}
                                                                className="h-7 px-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded transition-colors text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5"
                                                                title="Load Model into VRAM"
                                                            >
                                                                <Play className="w-3 h-3 fill-current" />
                                                                Load Model
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                                                            className="h-7 w-7 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded transition-colors"
                                                            title="Delete Model from Disk"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- DISCOVER VIEW (Split-View) --- */}
                {activeTab === 'discover' && (
                    <div className="h-full flex gap-4 overflow-hidden">

                        {/* Left Side: Search & List */}
                        <div className="w-1/3 flex flex-col bg-black/20 border border-white/10 rounded-xl overflow-hidden shrink-0">
                            <div className="p-4 border-b border-white/10 bg-white/[0.02]">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="Search Hub..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white outline-none focus:border-blue-500 text-sm transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto no-scrollbar">
                                {displayedDiscoverModels.map(model => (
                                    <button
                                        key={model.id}
                                        onClick={() => selectModelForDetails(model)}
                                        className={`w-full text-left p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${selectedModel?.id === model.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}`}
                                    >
                                        <div className="font-semibold text-white truncate text-sm mb-1">{cleanModelName(model.name)}</div>
                                        <div className="text-[11px] text-gray-500 font-mono truncate">{model.id}</div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400 border border-white/5">{guessPublisher(model.id)}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-gray-400 border border-white/5">{model.size}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right Side: Readme & Download */}
                        <div className="flex-1 flex flex-col bg-black/20 border border-white/10 rounded-xl overflow-hidden">
                            {selectedModel ? (
                                <>
                                    <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-start justify-between shrink-0">
                                        <div>
                                            <h2 className="text-xl font-bold mb-1">{selectedModel.name}</h2>
                                            <p className="text-sm text-gray-400 font-mono">{selectedModel.id}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDownload(selectedModel.id)}
                                            disabled={downloading.has(selectedModel.id)}
                                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                                        >
                                            {downloading.has(selectedModel.id) ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    Downloading...
                                                </>
                                            ) : (
                                                <>
                                                    <Download className="w-4 h-4" />
                                                    Download
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 bg-[#0E0E10]">
                                        {readmeLoading ? (
                                            <div className="flex items-center justify-center h-full text-gray-500 gap-3">
                                                <div className="w-5 h-5 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
                                                Loading Model Card...
                                            </div>
                                        ) : (
                                            <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-a:text-blue-400">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {readmeContent}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                                    <FileText className="w-12 h-12 mb-4 opacity-20" />
                                    <p>Select a model from the list to view its Model Card</p>
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </div>

            {/* Add Custom Local Folder Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => resetAddModal()}>
                    <div className="bg-[#18181B] border border-white/10 rounded-xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <HardDrive className="w-5 h-5 text-blue-400" />
                            Add Local Model Directory
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs uppercase text-gray-500 font-semibold mb-1.5">Model Alias</label>
                                <input
                                    type="text"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="e.g. My Meta Llama Finetune"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs uppercase text-gray-500 font-semibold mb-1.5">Local Directory Path</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customPath}
                                        onChange={(e) => setCustomPath(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && customPath) handleScan(customPath); }}
                                        placeholder="/Users/name/models/llama-3 or ~/.lmstudio/models"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 text-sm"
                                    />
                                    <button
                                        onClick={async () => {
                                            try {
                                                const path = await (window as any).electronAPI?.selectDirectory?.();
                                                if (path) {
                                                    setCustomPath(path);
                                                    handleScan(path);
                                                }
                                            } catch {
                                                // Fallback: just use the typed path
                                                if (customPath) handleScan(customPath);
                                            }
                                        }}
                                        className="bg-white/10 hover:bg-blue-500 hover:text-white text-gray-300 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        Browse
                                    </button>
                                    {!foundModels.length && customPath && !scanning && (
                                        <button
                                            onClick={() => handleScan(customPath)}
                                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-blue-500/20"
                                        >
                                            Scan
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => {
                                            const p = "~/.lmstudio/models";
                                            setCustomName("LM Studio Models");
                                            setCustomPath(p);
                                            handleScan(p);
                                        }}
                                        className="text-[10px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                                        LM Studio
                                    </button>
                                    <button
                                        onClick={() => {
                                            const p = "~/.ollama/models";
                                            setCustomName("Ollama Models");
                                            setCustomPath(p);
                                            handleScan(p);
                                        }}
                                        className="text-[10px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                                        Ollama
                                    </button>
                                    <button
                                        onClick={() => {
                                            const p = "~/.cache/huggingface/hub";
                                            setCustomName("HF Hub Cache");
                                            setCustomPath(p);
                                            handleScan(p);
                                        }}
                                        className="text-[10px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                                        HF Cache
                                    </button>
                                </div>

                                {scanning && (
                                    <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                                        Scanning directory for MLX models...
                                    </div>
                                )}

                                {foundModels.length > 0 && (
                                    <div className="mt-6 border border-white/10 rounded-lg overflow-hidden bg-black/40 max-h-48 overflow-y-auto">
                                        <div className="bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-white/5 flex justify-between">
                                            <span>Found Models ({foundModels.length})</span>
                                            <span>Select</span>
                                        </div>
                                        {foundModels.map(m => (
                                            <div key={m.path} className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                                                <div className="min-w-0 flex-1 mr-3">
                                                    <div className="text-xs font-medium text-white truncate">{m.name}</div>
                                                    <div className="text-[10px] text-gray-500 flex gap-2">
                                                        <span>{m.architecture}</span>
                                                        <span>{m.size}</span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPaths.has(m.path || '')}
                                                    onChange={() => togglePathSelection(m.path || '')}
                                                    className="w-4 h-4 rounded border-white/10 bg-black/40 text-blue-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {foundModels.length === 0 && !scanning && customPath && (
                                    <p className="text-[11px] text-gray-500 mt-2">
                                        Supported formats: MLX safetensors. The directory must contain `config.json`.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/5">
                            <button
                                onClick={() => resetAddModal()}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRegister}
                                disabled={(!customName || (!customPath && selectedPaths.size === 0)) || loading || scanning}
                                className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50"
                            >
                                {foundModels.length > 0 ? `Add Selected (${selectedPaths.size})` : 'Add Model'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
