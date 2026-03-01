import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { PageHeader } from './ui/PageHeader'
import { useToast } from './ui/Toast'
import { Wand2, Copy, Loader2, Download, Upload, FileText, Table, List, Expand, ListTree, Send, Printer } from 'lucide-react'
import { SimpleMdeReact } from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";
import { useGlobalState } from '../context/GlobalState'
import { useNotes } from '../context/NotesContext'
import { apiClient, cleanModelName } from '../api/client'

const LEGACY_STORAGE_KEY = 'silicon-studio-notes';

export function Workspace() {
    const { toast } = useToast()
    const { activeModel, setPendingChatInput } = useGlobalState()
    const { activeNoteId, setActiveNoteId, fetchNotes } = useNotes()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const skipLoadRef = useRef(false)

    const [documentBody, setDocumentBody] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [noteLoaded, setNoteLoaded] = useState(false)
    const creatingNoteRef = useRef(false)
    const lastSavedContentRef = useRef<string>('')

    // Load note when activeNoteId changes
    useEffect(() => {
        if (skipLoadRef.current) { skipLoadRef.current = false; return; }
        if (activeNoteId) {
            (async () => {
                try {
                    const note = await apiClient.notes.get(activeNoteId);
                    setDocumentBody(note.content);
                    setNoteLoaded(true);
                } catch {
                    setDocumentBody('');
                    setNoteLoaded(true);
                }
            })();
        } else {
            setDocumentBody('');
            setNoteLoaded(true);
        }
    }, [activeNoteId]);

    // Migrate legacy localStorage note on first load
    useEffect(() => {
        if (!activeNoteId && noteLoaded) {
            try {
                const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (legacy && legacy.trim()) {
                    setDocumentBody(legacy);
                    // Create a note from the legacy content
                    (async () => {
                        const note = await apiClient.notes.create('Migrated Note', legacy);
                        skipLoadRef.current = true;
                        setActiveNoteId(note.id);
                        fetchNotes();
                        localStorage.removeItem(LEGACY_STORAGE_KEY);
                    })();
                }
            } catch { /* ignore */ }
        }
    }, [noteLoaded, activeNoteId]);

    const editorOptions = useMemo(() => ({
        toolbar: false as const,
        status: false as const,
        spellChecker: false,
        placeholder: "Start writing... Markdown is supported.",
    }), [])

    // Flush pending save on unmount or note switch
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [activeNoteId]);

    // Debounced save: immediate local state, delayed backend persist
    const handleChange = useCallback((value: string) => {
        setDocumentBody(value);
        lastSavedContentRef.current = value;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            if (activeNoteId) {
                try {
                    await apiClient.notes.update(activeNoteId, { content: value });
                } catch {
                    // save failed silently
                }
            } else if (value.trim() && !creatingNoteRef.current) {
                // Auto-create a new note (guarded against double-create)
                creatingNoteRef.current = true;
                try {
                    const title = value.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || 'Untitled';
                    const note = await apiClient.notes.create(title, value);
                    skipLoadRef.current = true;
                    setActiveNoteId(note.id);
                    fetchNotes();
                } catch {
                    // create failed silently
                } finally {
                    creatingNoteRef.current = false;
                }
            }
        }, 800);
    }, [activeNoteId, setActiveNoteId, fetchNotes]);

    const handleNewNote = useCallback(() => {
        setActiveNoteId(null);
        setDocumentBody('');
    }, [setActiveNoteId]);

    // Export as .md file
    const handleExport = (format: 'md' | 'txt') => {
        const blob = new Blob([documentBody], { type: format === 'md' ? 'text/markdown' : 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const titleSlug = (documentBody.split('\n')[0]?.replace(/^#+\s*/, '').trim() || 'note').slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '');
        a.download = `${titleSlug}.${format}`
        a.click()
        URL.revokeObjectURL(url)
    }

    // PDF export via print dialog
    const handleExportPdf = () => {
        const win = window.open('', '_blank');
        if (!win) return;
        // Convert markdown to basic HTML (simple approach)
        const html = documentBody
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px">$1</code>')
            .replace(/\n/g, '<br>');
        win.document.write(`<!DOCTYPE html><html><head><title>Note</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;line-height:1.6;color:#333}h1,h2,h3{margin-top:1.5em}code{font-family:monospace}</style></head><body>${html}</body></html>`);
        win.document.close();
        win.print();
    };

    // Import from file
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const text = reader.result as string
            handleChange(text)
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    // Send selection or full content to chat
    const handleSendToChat = () => {
        const text = documentBody.trim();
        if (!text) return;
        setPendingChatInput(text);
    };

    // AI generation with streaming
    const handleAiCommand = async (command: string) => {
        if (!activeModel) return
        setIsGenerating(true)

        const prompts: Record<string, string> = {
            continue: `Continue writing the following document naturally. Return only the continuation, no preamble:\n\n${documentBody}`,
            summarize: `Provide a brief TL;DR summary of this document. Return only the summary:\n\n${documentBody}`,
            draft: `Write an introduction section for the following document. Return only the introduction:\n\n${documentBody}`,
            toTable: `Restructure the following content as a well-formatted markdown table. Return only the table:\n\n${documentBody}`,
            keyPoints: `Extract the key points from this document as a concise bulleted list. Return only the bullet points:\n\n${documentBody}`,
            expand: `Expand the last paragraph of this document with more detail and depth. Return only the expanded paragraph:\n\n${documentBody}`,
            outline: `Generate a structured outline (with headings and sub-points) from this document. Return only the outline:\n\n${documentBody}`,
        }

        const prompt = prompts[command] || prompts.continue
        const appendCommands = ['continue', 'expand'];
        const shouldAppend = appendCommands.includes(command);

        try {
            const response = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_id: activeModel.id,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 512
                })
            })

            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let generated = ''
            let lineBuffer = ''

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    lineBuffer += decoder.decode(value, { stream: true })
                    const lines = lineBuffer.split('\n')
                    lineBuffer = lines.pop() ?? ''
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))
                                if (data.text) generated += data.text
                            } catch { /* skip partial JSON */ }
                        }
                    }
                }
            }

            if (generated.trim()) {
                if (shouldAppend) {
                    handleChange(documentBody + '\n\n' + generated.trim())
                } else {
                    handleChange(documentBody + '\n\n---\n\n' + generated.trim())
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast(`AI generation failed: ${msg}`, 'error')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="h-full flex flex-col text-white overflow-hidden pb-4">
            <PageHeader>
                <div className="flex items-center gap-2">
                    {/* Import */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        title="Import file"
                        accept=".md,.txt,.markdown,.text"
                        onChange={handleImport}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        title="Import file"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Import
                    </button>

                    {/* Export */}
                    <button
                        type="button"
                        onClick={() => handleExport('md')}
                        disabled={!documentBody.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        title="Export as Markdown"
                    >
                        <Download className="w-3.5 h-3.5" />
                        .md
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExport('txt')}
                        disabled={!documentBody.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        title="Export as plain text"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        .txt
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={!documentBody.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        title="Export as PDF (via print)"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        PDF
                    </button>

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    <button
                        type="button"
                        onClick={handleNewNote}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        title="New note"
                    >
                        New Note
                    </button>
                </div>
            </PageHeader>

            <div className="flex-1 flex gap-4 overflow-hidden min-h-0">

                {/* Editor Area */}
                <div className="flex-1 bg-[#18181B] border border-white/10 rounded-xl overflow-hidden flex flex-col">

                    {/* Status bar */}
                    <div className="h-9 border-b border-white/5 bg-white/[0.02] flex items-center px-4 justify-between shrink-0">
                        <span className="text-[10px] text-gray-500 font-mono tabular-nums">{documentBody.length} chars</span>
                        {activeModel && (
                            <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                {cleanModelName(activeModel.name)}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto editor-container">
                        <SimpleMdeReact
                            value={documentBody}
                            onChange={handleChange}
                            options={editorOptions}
                        />
                    </div>
                </div>

                {/* AI Commands sidebar */}
                <div className="w-64 flex flex-col gap-3 shrink-0">
                    <div className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                        <h3 className="text-xs font-medium text-gray-400 mb-1">AI Commands</h3>
                        <p className="text-[10px] text-gray-600 mb-1">
                            {activeModel ? `Using ${cleanModelName(activeModel.name)}` : 'Load a model to enable'}
                        </p>
                        <AiButton
                            label="Continue Writing"
                            description="AI continues the document"
                            icon={<Wand2 className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('continue')}
                            disabled={isGenerating || !activeModel}
                            loading={isGenerating}
                        />
                        <AiButton
                            label="Summarize"
                            description="Generate a TL;DR"
                            icon={<Copy className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('summarize')}
                            disabled={isGenerating || !activeModel}
                        />
                        <AiButton
                            label="Draft Introduction"
                            description="Generate a new section"
                            icon={<FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('draft')}
                            disabled={isGenerating || !activeModel}
                        />
                    </div>

                    <div className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                        <h3 className="text-xs font-medium text-gray-400 mb-1">Transform</h3>
                        <AiButton
                            label="To Table"
                            description="Restructure as markdown table"
                            icon={<Table className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('toTable')}
                            disabled={isGenerating || !activeModel || !documentBody.trim()}
                        />
                        <AiButton
                            label="Key Points"
                            description="Extract bullet-point summary"
                            icon={<List className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('keyPoints')}
                            disabled={isGenerating || !activeModel || !documentBody.trim()}
                        />
                        <AiButton
                            label="Expand Section"
                            description="Expand last paragraph"
                            icon={<Expand className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('expand')}
                            disabled={isGenerating || !activeModel || !documentBody.trim()}
                        />
                        <AiButton
                            label="Generate Outline"
                            description="Structured outline from content"
                            icon={<ListTree className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={() => handleAiCommand('outline')}
                            disabled={isGenerating || !activeModel || !documentBody.trim()}
                        />
                    </div>

                    <div className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                        <h3 className="text-xs font-medium text-gray-400 mb-1">Actions</h3>
                        <AiButton
                            label="Send to Chat"
                            description="Use note content as chat input"
                            icon={<Send className="w-4 h-4 text-gray-400 shrink-0" />}
                            onClick={handleSendToChat}
                            disabled={!documentBody.trim()}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

function AiButton({ label, description, icon, onClick, disabled, loading }: {
    label: string
    description: string
    icon: React.ReactNode
    onClick: () => void
    disabled: boolean
    loading?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-black/30 hover:bg-white/5 border border-white/5 rounded-lg transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
            {icon}
            <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-200">{label}</div>
                <div className="text-[10px] text-gray-600">{description}</div>
            </div>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
        </button>
    )
}
