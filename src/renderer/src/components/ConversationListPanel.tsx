import { Search, Pin, PinOff, Trash2, Edit3, Check, X, MessageSquare, GitFork } from 'lucide-react'
import type { ConversationSummary } from '../api/client'

interface ConversationListPanelProps {
    conversations: ConversationSummary[]
    activeId: string | null
    searchQuery: string
    onSearch: (query: string) => void
    onSelect: (id: string) => void
    onDelete: (id: string) => void
    onRename: (id: string, title: string) => void
    onTogglePin: (id: string, pinned: boolean) => void
    renamingId: string | null
    renameValue: string
    onStartRename: (id: string, title: string) => void
    onCancelRename: () => void
    onRenameValueChange: (value: string) => void
    loading: boolean
}

export function ConversationListPanel({
    conversations,
    activeId,
    searchQuery,
    onSearch,
    onSelect,
    onDelete,
    onRename,
    onTogglePin,
    renamingId,
    renameValue,
    onStartRename,
    onCancelRename,
    onRenameValueChange,
    loading,
}: ConversationListPanelProps) {
    return (
        <div className="w-full flex flex-col gap-2 overflow-hidden">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input
                    type="text"
                    title="Search conversations"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => onSearch(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-all"
                />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-1">
                {loading && conversations.length === 0 && (
                    <div className="p-6 text-center">
                        <div className="w-4 h-4 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin mx-auto" />
                    </div>
                )}
                {conversations.map((conv) => (
                    <div
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        className={`group/conv flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                            activeId === conv.id
                                ? 'bg-blue-500/10 border-blue-500/30'
                                : 'bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/5'
                        }`}
                    >
                        <div className="min-w-0 flex-1">
                            {renamingId === conv.id ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        value={renameValue}
                                        onChange={(e) => onRenameValueChange(e.target.value)}
                                        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:border-blue-500/50"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') onRename(conv.id, renameValue);
                                            if (e.key === 'Escape') onCancelRename();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onRename(conv.id, renameValue); }}
                                        className="p-0.5 text-green-400 hover:text-green-300"
                                    >
                                        <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onCancelRename(); }}
                                        className="p-0.5 text-gray-500 hover:text-gray-400"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-1.5">
                                        {conv.pinned && <Pin className="w-3 h-3 text-blue-400 shrink-0" />}
                                        {conv.branched_from && <GitFork className="w-3 h-3 text-blue-400 shrink-0" />}
                                        <span className="text-xs font-medium text-gray-200 truncate">{conv.title}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-2">
                                        <span>{conv.message_count} msgs</span>
                                        <span>{formatTimeAgo(conv.updated_at)}</span>
                                    </div>
                                    {conv.match_context && (
                                        <p className="text-[10px] text-gray-500 mt-1 truncate italic">
                                            {conv.match_context}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                        {/* Hover actions */}
                        {renamingId !== conv.id && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/conv:opacity-100 transition-opacity shrink-0 ml-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id, conv.pinned); }}
                                    className="p-1 text-gray-600 hover:text-blue-400 rounded transition-colors"
                                    title={conv.pinned ? 'Unpin' : 'Pin'}
                                >
                                    {conv.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onStartRename(conv.id, conv.title); }}
                                    className="p-1 text-gray-600 hover:text-white rounded transition-colors"
                                    title="Rename"
                                >
                                    <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                                    className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {conversations.length === 0 && !loading && (
                    <div className="p-6 text-center">
                        <MessageSquare className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                        <p className="text-xs text-gray-600">
                            {searchQuery ? 'No matches found.' : 'No conversations yet.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

function formatTimeAgo(isoString: string): string {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(isoString).toLocaleDateString();
}
