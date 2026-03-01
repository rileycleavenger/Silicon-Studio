import { useState, useEffect, useRef } from 'react';
import { useGlobalState } from '../context/GlobalState';
import { apiClient, cleanModelName } from '../api/client';
import type { ModelEntry } from '../api/client';
import { DatabaseZap, LogOut, ChevronDown, Loader2 } from 'lucide-react';

const TOPBAR_SETTINGS_KEY = 'silicon-studio-topbar-settings';

function getThresholds(): { warn: number; critical: number } {
    try {
        const saved = localStorage.getItem(TOPBAR_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { warn: parsed.warn ?? 60, critical: parsed.critical ?? 85 };
        }
    } catch { /* ignore */ }
    return { warn: 60, critical: 85 };
}

function usageColor(percent: number, thresholds: { warn: number; critical: number }): string {
    if (percent >= thresholds.critical) return 'bg-red-500';
    if (percent >= thresholds.warn) return 'bg-yellow-500';
    return 'bg-green-500';
}

function usageTextColor(percent: number, thresholds: { warn: number; critical: number }): string {
    if (percent >= thresholds.critical) return 'text-red-400';
    if (percent >= thresholds.warn) return 'text-yellow-400';
    return 'text-gray-300';
}

function MiniBar({ percent, thresholds }: { percent: number; thresholds: { warn: number; critical: number } }) {
    return (
        <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-500 ${usageColor(percent, thresholds)}`}
                style={{ width: `${Math.min(percent, 100)}%` }}
            />
        </div>
    );
}

export function TopBar() {
    const { backendReady, systemStats, activeModel, setActiveModel, isTraining } = useGlobalState();
    const thresholds = getThresholds();
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [models, setModels] = useState<ModelEntry[]>([]);
    const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleEject = async () => {
        try { await apiClient.engine.unloadModel(); } catch { /* best-effort */ }
        setActiveModel(null);
    };

    const handleLoadModel = async (model: ModelEntry) => {
        setLoadingModelId(model.id);
        try {
            const result = await apiClient.engine.loadModel(model.id);
            setActiveModel({
                id: model.id,
                name: cleanModelName(model.name),
                size: model.size,
                path: model.local_path || model.id,
                architecture: model.architecture,
                context_window: result.context_window,
            });
            setShowModelMenu(false);
        } catch { /* ignore */ }
        finally { setLoadingModelId(null); }
    };

    const toggleMenu = async () => {
        if (!showModelMenu) {
            try {
                const all = await apiClient.engine.getModels();
                setModels(all.filter(m => m.downloaded));
            } catch { setModels([]); }
        }
        setShowModelMenu(!showModelMenu);
    };

    // Close dropdown on outside click
    useEffect(() => {
        if (!showModelMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowModelMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showModelMenu]);

    return (
        <div className="h-10 w-full drag-region bg-[#18181B]/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 z-50">

            {/* Left: Window Title Placeholder */}
            <div className="flex items-center space-x-2 pl-[80px]">
                <span className="text-[10px] font-bold text-gray-500 tracking-wide uppercase">SiliconDev</span>
            </div>

            {/* Center/Right: Status Indicators */}
            <div className="no-drag flex items-center space-x-6">

                {/* Backend Status */}
                <div className="flex items-center space-x-2 h-full">
                    <div className={`w-1.5 h-1.5 rounded-full ${backendReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-[10px] text-gray-400 font-medium">
                        {backendReady ? 'Ready' : 'Starting...'}
                    </span>
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Active Model + Switcher */}
                <div className="relative" ref={menuRef}>
                    {activeModel ? (
                        <div className="flex items-center bg-blue-500/10 h-7 px-2.5 rounded border border-blue-500/20">
                            <button
                                onClick={toggleMenu}
                                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                title="Switch model"
                            >
                                <DatabaseZap size={13} className="text-blue-400" />
                                <span className="text-[11px] font-medium text-blue-300 max-w-[160px] truncate">{cleanModelName(activeModel.name)}</span>
                                <ChevronDown size={11} className="text-blue-400/60" />
                            </button>
                            <div className="w-px h-3.5 bg-blue-500/20 mx-1.5"></div>
                            <button
                                onClick={handleEject}
                                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Unload model from memory"
                            >
                                <LogOut size={11} />
                                <span className="text-[10px] font-medium">Eject</span>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={toggleMenu}
                            className="flex items-center gap-2 h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 transition-colors"
                            title="Load a model"
                        >
                            <DatabaseZap size={13} className="text-gray-500" />
                            <span className="text-[11px] text-gray-500 font-medium">Load model</span>
                            <ChevronDown size={11} className="text-gray-600" />
                        </button>
                    )}

                    {/* Model picker dropdown */}
                    {showModelMenu && (
                        <div className="absolute top-full right-0 mt-1 w-72 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-[100]">
                            <div className="px-3 py-2 border-b border-white/5">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Downloaded Models</span>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {models.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-xs text-gray-600">No downloaded models found</div>
                                ) : models.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => handleLoadModel(m)}
                                        disabled={loadingModelId === m.id || activeModel?.id === m.id}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                            activeModel?.id === m.id
                                                ? 'bg-blue-500/10 text-blue-300'
                                                : 'text-gray-300 hover:bg-white/5'
                                        } disabled:opacity-60`}
                                    >
                                        {loadingModelId === m.id ? (
                                            <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />
                                        ) : (
                                            <DatabaseZap size={12} className={activeModel?.id === m.id ? 'text-blue-400' : 'text-gray-600'} />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-medium truncate">{cleanModelName(m.name)}</div>
                                            <div className="text-[9px] text-gray-600">{m.size}{m.architecture ? ` · ${m.architecture}` : ''}</div>
                                        </div>
                                        {activeModel?.id === m.id && (
                                            <span className="text-[9px] text-blue-400 font-bold shrink-0">ACTIVE</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* System Stats (RAM/CPU) with color bars */}
                {systemStats ? (
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center gap-1.5" title={`RAM: ${(systemStats.memory.used / (1024 * 1024 * 1024)).toFixed(1)}/${(systemStats.memory.total / (1024 * 1024 * 1024)).toFixed(0)}GB (${systemStats.memory.percent.toFixed(0)}%)`}>
                            <span className="text-[10px] text-gray-500 font-mono">RAM</span>
                            <MiniBar percent={systemStats.memory.percent} thresholds={thresholds} />
                            <span className={`text-[11px] font-mono tabular-nums ${usageTextColor(systemStats.memory.percent, thresholds)}`}>
                                {systemStats.memory.percent.toFixed(0)}%
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5" title={`CPU: ${systemStats.cpu.percent.toFixed(0)}%`}>
                            <span className="text-[10px] text-gray-500 font-mono">CPU</span>
                            <MiniBar percent={systemStats.cpu.percent} thresholds={thresholds} />
                            <span className={`text-[11px] font-mono tabular-nums ${usageTextColor(systemStats.cpu.percent, thresholds)}`}>
                                {systemStats.cpu.percent.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                ) : (
                    <span className="text-xs text-gray-600 font-mono">Loading Stats...</span>
                )}

                {/* Global Task Indicator (Training) */}
                {isTraining && (
                    <>
                        <div className="h-4 w-px bg-white/10" />
                        <div className="flex items-center space-x-1.5">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-xs text-blue-400 font-medium">Training Active</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
