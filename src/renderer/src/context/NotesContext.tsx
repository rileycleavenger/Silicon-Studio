import React, { createContext, useContext, useState, useCallback } from 'react'
import { apiClient } from '../api/client'
import type { NoteSummary } from '../api/client'

interface NotesContextType {
    notesList: NoteSummary[]
    listLoading: boolean
    activeNoteId: string | null
    setActiveNoteId: (id: string | null) => void
    fetchNotes: () => void
    handleDeleteNote: (id: string) => void
    handleRenameNote: (id: string, title: string) => void
    handleTogglePin: (id: string, pinned: boolean) => void
    renamingId: string | null
    renameValue: string
    startRename: (id: string, title: string) => void
    cancelRename: () => void
    setRenameValue: (value: string) => void
}

const NotesContext = createContext<NotesContextType | undefined>(undefined)

export function NotesProvider({ children }: { children: React.ReactNode }) {
    const [notesList, setNotesList] = useState<NoteSummary[]>([])
    const [listLoading, setListLoading] = useState(false)
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    const fetchNotes = useCallback(async () => {
        setListLoading(true)
        try {
            const list = await apiClient.notes.list()
            setNotesList(list)
        } catch {
            // ignore
        } finally {
            setListLoading(false)
        }
    }, [])

    const handleDeleteNote = useCallback(async (id: string) => {
        try {
            await apiClient.notes.delete(id)
            setNotesList(prev => prev.filter(n => n.id !== id))
            if (activeNoteId === id) setActiveNoteId(null)
        } catch {
            // ignore
        }
    }, [activeNoteId])

    const handleRenameNote = useCallback(async (id: string, title: string) => {
        try {
            await apiClient.notes.update(id, { title })
            setNotesList(prev => prev.map(n => n.id === id ? { ...n, title } : n))
            setRenamingId(null)
        } catch {
            // ignore
        }
    }, [])

    const handleTogglePin = useCallback(async (id: string, currentlyPinned: boolean) => {
        const pinned = !currentlyPinned
        try {
            await apiClient.notes.update(id, { pinned })
            setNotesList(prev => {
                const updated = prev.map(n => n.id === id ? { ...n, pinned } : n)
                updated.sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
                    return b.updated_at.localeCompare(a.updated_at)
                })
                return updated
            })
        } catch {
            // ignore
        }
    }, [])

    const startRename = useCallback((id: string, title: string) => {
        setRenamingId(id)
        setRenameValue(title)
    }, [])

    const cancelRename = useCallback(() => {
        setRenamingId(null)
        setRenameValue('')
    }, [])

    return (
        <NotesContext.Provider value={{
            notesList,
            listLoading,
            activeNoteId,
            setActiveNoteId,
            fetchNotes,
            handleDeleteNote,
            handleRenameNote,
            handleTogglePin,
            renamingId,
            renameValue,
            startRename,
            cancelRename,
            setRenameValue,
        }}>
            {children}
        </NotesContext.Provider>
    )
}

export function useNotes() {
    const context = useContext(NotesContext)
    if (context === undefined) {
        throw new Error('useNotes must be used within a NotesProvider')
    }
    return context
}
