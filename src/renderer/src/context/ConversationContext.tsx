import React, { createContext, useContext, useState, useCallback } from 'react'
import { apiClient, type ConversationSummary } from '../api/client'

interface ConversationContextType {
    conversationList: ConversationSummary[]
    listLoading: boolean
    searchQuery: string
    activeConversationId: string | null
    setActiveConversationId: (id: string | null) => void
    renamingId: string | null
    renameValue: string
    startRename: (id: string, title: string) => void
    cancelRename: () => void
    setRenameValue: (value: string) => void
    fetchConversations: () => Promise<void>
    handleSearch: (query: string) => void
    handleDeleteConversation: (id: string) => Promise<void>
    handleRenameConversation: (id: string, title: string) => Promise<void>
    handleTogglePin: (id: string, pinned: boolean) => Promise<void>
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

export function ConversationProvider({ children }: { children: React.ReactNode }) {
    const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
    const [listLoading, setListLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    const fetchConversations = useCallback(async () => {
        try {
            setListLoading(true)
            const list = await apiClient.conversations.list()
            setConversationList(list)
        } catch {
            // fetch failed silently
        } finally {
            setListLoading(false)
        }
    }, [])

    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query)
        if (!query.trim()) { fetchConversations(); return }
        try {
            const results = await apiClient.conversations.search(query)
            setConversationList(results)
        } catch {
            // search failed silently
        }
    }, [fetchConversations])

    const handleDeleteConversation = useCallback(async (id: string) => {
        if (!window.confirm('Delete this conversation?')) return
        try {
            await apiClient.conversations.delete(id)
            if (activeConversationId === id) setActiveConversationId(null)
            fetchConversations()
        } catch {
            // delete failed silently
        }
    }, [activeConversationId, fetchConversations])

    const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
        try {
            await apiClient.conversations.update(id, { title: newTitle })
            setRenamingId(null)
            fetchConversations()
        } catch {
            // rename failed silently
        }
    }, [fetchConversations])

    const handleTogglePin = useCallback(async (id: string, currentPinned: boolean) => {
        try {
            await apiClient.conversations.update(id, { pinned: !currentPinned })
            fetchConversations()
        } catch {
            // toggle failed silently
        }
    }, [fetchConversations])

    const startRename = useCallback((id: string, title: string) => {
        setRenamingId(id)
        setRenameValue(title)
    }, [])

    const cancelRename = useCallback(() => setRenamingId(null), [])

    return (
        <ConversationContext.Provider value={{
            conversationList,
            listLoading,
            searchQuery,
            activeConversationId,
            setActiveConversationId,
            renamingId,
            renameValue,
            startRename,
            cancelRename,
            setRenameValue,
            fetchConversations,
            handleSearch,
            handleDeleteConversation,
            handleRenameConversation,
            handleTogglePin,
        }}>
            {children}
        </ConversationContext.Provider>
    )
}

export function useConversations() {
    const context = useContext(ConversationContext)
    if (context === undefined) {
        throw new Error('useConversations must be used within a ConversationProvider')
    }
    return context
}
