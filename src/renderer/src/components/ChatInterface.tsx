import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { apiClient, cleanModelName } from '../api/client'
import type { SandboxResult, SyntaxCheckResult, SelfAssessment, ConversationMemory } from '../api/client'
import { PageHeader } from './ui/PageHeader'
import { Settings2, Cpu, Copy, Check, ChevronRight, ChevronLeft, Square, ArrowUp, Wand2, Shield, Zap, FileText, TestTube2, Expand, Shrink, Languages, Briefcase, MessageCircle, GraduationCap, Scale, Eye, EyeOff, User, Baby, FlaskConical, Feather, Plus, Download, GitFork, Play, Loader2, CircleCheck, CircleX, ShieldCheck, Brain, Globe, RefreshCcw, Database, Bot, Search, X, ChevronUp, ChevronDown, ChevronsRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useGlobalState } from '../context/GlobalState'
import { useConversations } from '../context/ConversationContext'

interface SourceRef {
    index: number
    title: string
    url?: string
    method: string
}

interface Message {
    id?: string
    role: 'system' | 'user' | 'assistant'
    content: string
    displayContent?: string
    actionType?: string
    sources?: SourceRef[]
    stats?: {
        tokensPerSecond: number;
        timeToFirstToken: number;
        totalTokens: number;
    }
}

const CHAT_STORAGE_KEY = 'silicon-studio-chat-history';
const SETTINGS_STORAGE_KEY = 'silicon-studio-chat-settings';
const CONVERSATIONS_MIGRATED_KEY = 'silicon-studio-conversations-migrated';

export function ChatInterface() {
    const { activeModel, setActiveModel, backendReady, pendingChatInput, setPendingChatInput } = useGlobalState()

    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = localStorage.getItem(CHAT_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    })
    const [input, setInput] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)


    const [paramsExpanded, setParamsExpanded] = useState(() => localStorage.getItem('paramsExpanded') === 'true')
    const toggleParams = () => {
        setParamsExpanded(prev => {
            const next = !prev;
            localStorage.setItem('paramsExpanded', String(next));
            return next;
        });
    }
    const [settings, setSettings] = useState(() => {
        const allActions = [
            'longer', 'shorter', 'formal', 'casual', 'technical', 'translate',
            'devil', 'perspective_ceo', 'perspective_child', 'perspective_scientist', 'perspective_poet',
            'improve', 'secure', 'faster', 'docs', 'tests', 'selfAssess', 'selfCritique',
        ];
        const defaultEnabledActions: Record<string, boolean> = {};
        allActions.forEach(a => { defaultEnabledActions[a] = true; });
        const defaults = {
            systemPrompt: "You are a helpful AI assistant running locally on Apple Silicon.",
            temperature: 0.7,
            maxTokens: 2048,
            maxContext: 4096,
            topP: 0.9,
            repetitionPenalty: 1.1,
            reasoningMode: 'auto' as 'off' | 'auto' | 'low' | 'high',
            translateLanguage: '',
            showPrompt: false,
            syntaxCheck: true,
            autoFixSyntax: false,
            enabledActions: defaultEnabledActions,
            memoryMapEnabled: false,
            memoryInterval: 5,
            piiRedaction: false,
            ragEnabled: false,
            ragCollectionId: '',
            webSearchEnabled: false,
        };
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch {
            return defaults;
        }
    })

    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [isGenerating, setIsGenerating] = useState(false)

    // Conversation context (list + active ID managed in sidebar)
    const { activeConversationId, setActiveConversationId, fetchConversations, conversationList } = useConversations()
    const activeConversationIdRef = useRef<string | null>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const skipLoadRef = useRef(false)
    const creatingConvRef = useRef(false)

    // Self-assessment scores per message index
    const [assessments, setAssessments] = useState<Record<number, SelfAssessment | 'loading'>>({})
    // Self-critique loading state per message index
    const [selfCritiqueLoading, setSelfCritiqueLoading] = useState<Record<number, boolean>>({})

    // RAG collections cache
    const [ragCollections, setRagCollections] = useState<{ id: string; name: string; chunks: number }[]>([])
    const fetchRagCollections = useCallback(async () => {
        try {
            const cols = await apiClient.rag.getCollections();
            setRagCollections(cols.map(c => ({ id: c.id, name: c.name, chunks: c.chunks })));
        } catch { /* ignore */ }
    }, []);

    // Semantic memory map
    const [memoryMap, setMemoryMap] = useState<ConversationMemory | null>(null)
    const [showMemoryMap, setShowMemoryMap] = useState(false)
    const [memoryBuilding, setMemoryBuilding] = useState(false)
    const memoryBuildingRef = useRef(false)

    // One-click model walkthrough
    const [walkthroughStep, setWalkthroughStep] = useState<'idle' | 'downloading' | 'loading' | 'done' | 'error'>('idle')
    const [walkthroughModel, setWalkthroughModel] = useState<string | null>(null)
    const [walkthroughError, setWalkthroughError] = useState<string | null>(null)
    const walkthroughPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const startWalkthrough = async (modelId: string) => {
        setWalkthroughModel(modelId)
        setWalkthroughStep('downloading')
        setWalkthroughError(null)
        try {
            await apiClient.engine.downloadModel(modelId)
            // Poll models list until downloaded
            walkthroughPollRef.current = setInterval(async () => {
                try {
                    const models = await apiClient.engine.getModels()
                    const target = models.find(m => m.id === modelId)
                    if (target?.downloaded) {
                        if (walkthroughPollRef.current) clearInterval(walkthroughPollRef.current)
                        walkthroughPollRef.current = null
                        setWalkthroughStep('loading')
                        try {
                            const loadResult = await apiClient.engine.loadModel(modelId)
                            setActiveModel({
                                id: modelId,
                                name: target.name,
                                size: target.size,
                                path: target.local_path || '',
                                architecture: loadResult.architecture,
                                context_window: loadResult.context_window,
                            })
                            setWalkthroughStep('done')
                        } catch {
                            setWalkthroughStep('error')
                            setWalkthroughError('Download succeeded but failed to load model. Try loading it from the Models tab.')
                        }
                    }
                } catch { /* poll failed, keep trying */ }
            }, 3000)
        } catch {
            setWalkthroughStep('error')
            setWalkthroughError('Failed to start download. Check that the backend is running.')
        }
    }

    // Cleanup walkthrough poll on unmount
    useEffect(() => {
        return () => {
            if (walkthroughPollRef.current) clearInterval(walkthroughPollRef.current)
        }
    }, [])

    // In-chat search
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchMatchIndex, setSearchMatchIndex] = useState(0)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Compute search matches: [messageIndex, ...] of messages containing query
    const searchMatches = searchQuery.trim()
        ? messages.reduce<number[]>((acc, msg, i) => {
            if (msg.content.toLowerCase().includes(searchQuery.toLowerCase())) acc.push(i)
            return acc
        }, [])
        : []

    const toggleSearch = () => {
        setShowSearch(prev => {
            if (!prev) setTimeout(() => searchInputRef.current?.focus(), 50)
            else { setSearchQuery(''); setSearchMatchIndex(0) }
            return !prev
        })
    }

    // Ctrl+F to open search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault()
                if (!showSearch) toggleSearch()
                else searchInputRef.current?.focus()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [showSearch])

    // Auto-scroll to first match when search query changes
    useEffect(() => {
        if (searchMatches.length > 0) {
            setSearchMatchIndex(0)
            document.getElementById(`msg-${searchMatches[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

    // Keep ref in sync for use in async callbacks
    useEffect(() => { activeConversationIdRef.current = activeConversationId }, [activeConversationId])

    // Dynamic defaults: adjust maxTokens when a model with known context_window is loaded
    useEffect(() => {
        const cw = activeModel?.context_window;
        if (!cw) return;
        // Set maxTokens to half the context window, clamped between 2048 and 16384
        const recommended = Math.min(Math.max(Math.floor(cw / 2), 2048), 16384);
        setSettings((prev: Record<string, unknown>) => {
            // Only auto-adjust if user hasn't manually changed from a previous default
            // (i.e., the current value is one of the known static defaults)
            const isDefault = prev.maxTokens === 1024 || prev.maxTokens === 512 || prev.maxTokens === 2048;
            if (isDefault || (prev.maxTokens as number) > cw) {
                return { ...prev, maxTokens: recommended };
            }
            return prev;
        });
    }, [activeModel?.context_window]);

    // Consume pending chat input from Notes → Chat bridge
    useEffect(() => {
        if (pendingChatInput) {
            setInput(pendingChatInput);
            setPendingChatInput(null);
            textareaRef.current?.focus();
        }
    }, [pendingChatInput, setPendingChatInput]);

    const currentModelId = activeModel?.id ?? '';
    const currentModelName = activeModel ? cleanModelName(activeModel.name) : '';

    // --- Conversation helpers ---
    const autoTitle = (msgs: Message[]) => {
        const first = msgs.find(m => m.role === 'user');
        if (!first) return 'New conversation';
        const raw = first.content.slice(0, 60);
        return raw.length < first.content.length ? raw.replace(/\s+\S*$/, '') + '...' : raw;
    };

    // Migration: move old localStorage chat to backend on first load
    useEffect(() => {
        const migrate = async () => {
            const migrated = localStorage.getItem(CONVERSATIONS_MIGRATED_KEY);
            if (migrated) { fetchConversations(); return; }
            try {
                const oldMessages = localStorage.getItem(CHAT_STORAGE_KEY);
                if (oldMessages) {
                    const parsed = JSON.parse(oldMessages);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const conv = await apiClient.conversations.create(
                            autoTitle(parsed), parsed, currentModelId || undefined
                        );
                        skipLoadRef.current = true;
                        setActiveConversationId(conv.id);
                    }
                }
            } catch {
                // migration failed silently
            }
            localStorage.setItem(CONVERSATIONS_MIGRATED_KEY, 'true');
            fetchConversations();
        };
        migrate();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load conversation when activeConversationId changes from sidebar
    useEffect(() => {
        if (skipLoadRef.current) { skipLoadRef.current = false; return; }
        if (activeConversationId) {
            (async () => {
                try {
                    const conv = await apiClient.conversations.get(activeConversationId);
                    setMessages(conv.messages || []);
                    setAssessments({});
                    setMemoryMap(null);
                    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conv.messages || []));
                } catch {
                    // load failed silently
                }
            })();
        } else {
            // New conversation
            setMessages([]);
            setAssessments({});
            setMemoryMap(null);
            localStorage.removeItem(CHAT_STORAGE_KEY);
        }
    }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Write-through: localStorage (immediate) + backend (debounced 800ms)
    useEffect(() => {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        if (messages.length === 0) return;
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                const convId = activeConversationIdRef.current;
                if (convId) {
                    await apiClient.conversations.update(convId, {
                        messages, model_id: currentModelId || undefined,
                    });
                } else if (!creatingConvRef.current) {
                    creatingConvRef.current = true;
                    try {
                        const conv = await apiClient.conversations.create(
                            autoTitle(messages), messages, currentModelId || undefined
                        );
                        skipLoadRef.current = true;
                        setActiveConversationId(conv.id);
                    } finally {
                        creatingConvRef.current = false;
                    }
                }
                fetchConversations();
            } catch {
                // save failed silently
            }
        }, 800);
        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Auto-build memory map every N messages
    useEffect(() => {
        if (!settings.memoryMapEnabled || isGenerating) return;
        const interval = settings.memoryInterval || 5;
        const lastProcessed = memoryMap?.lastProcessedIndex ?? -1;
        const unprocessed = messages.length - 1 - lastProcessed;
        if (unprocessed >= interval) {
            buildMemoryMap(messages, memoryMap);
        }
    }, [messages.length, isGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '0';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input])

    const handleNewConversation = () => {
        setActiveConversationId(null);
    };

    const handleExport = (format: 'md' | 'json') => {
        const title = conversationList.find(c => c.id === activeConversationId)?.title || 'conversation';
        const safeName = title.replace(/[^a-zA-Z0-9 _-]/g, '_').slice(0, 50);
        let blob: Blob;
        if (format === 'md') {
            const md = messages.map(msg => {
                const header = msg.role === 'user' ? '## User' : msg.role === 'assistant' ? '## Assistant' : '## System';
                return `${header}\n\n${msg.content}`;
            }).join('\n\n---\n\n');
            blob = new Blob([md], { type: 'text/markdown' });
        } else {
            blob = new Blob([JSON.stringify({ title, messages, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}.${format === 'md' ? 'md' : 'json'}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // PII redaction state
    const [redactedCount, setRedactedCount] = useState<number | null>(null);

    const handleRedactConversation = (scope: 'all' | 'outgoing') => {
        let totalCount = 0;
        const updated = messages.map(msg => {
            if (scope === 'outgoing' && msg.role !== 'user') return msg;
            const { text, count } = redactPII(msg.content);
            if (count > 0) {
                totalCount += count;
                return { ...msg, content: text };
            }
            return msg;
        });
        if (totalCount > 0) {
            setMessages(updated);
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(updated));
            setRedactedCount(totalCount);
            setTimeout(() => setRedactedCount(null), 3000);
        }
    };

    const handleBranch = async (messageIndex: number) => {
        if (!activeConversationId) return;
        try {
            const branch = await apiClient.conversations.branch(activeConversationId, messageIndex);
            await fetchConversations();
            // Switch to the new branch — skip re-loading since we have the messages
            skipLoadRef.current = true;
            setActiveConversationId(branch.id);
            setMessages(branch.messages);
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(branch.messages));
        } catch {
            // branch failed silently
        }
    };

    const handleStop = async () => {
        try {
            await apiClient.engine.stopChat();
            setIsGenerating(false);
        } catch {
            // stop failed silently
        }
    }

    const handleSend = async (directPrompt?: string, displayContent?: string, actionType?: string) => {
        const text = directPrompt ?? input;
        if (!text.trim() || !currentModelId || isGenerating) return

        const userMsg: Message = { role: 'user', content: text, ...(displayContent && { displayContent }), ...(actionType && { actionType }) }

        // Build system prompt with optional reasoning instructions
        let systemContent = settings.systemPrompt?.trim() || '';
        const reasoningInstructions: Record<string, string> = {
            off: '',
            auto: '',
            low: '\n\nBefore answering, briefly outline your reasoning in 2-3 sentences, then provide your response. Keep the reasoning concise.',
            high: '\n\nBefore answering, think through the problem step by step. Consider multiple angles, edge cases, and potential issues. Show your full reasoning process, then provide a thorough response.',
        };
        const cotSuffix = reasoningInstructions[settings.reasoningMode] || '';
        if (cotSuffix) systemContent += cotSuffix;

        // Inject semantic memory context if available
        if (settings.memoryMapEnabled && memoryMap && memoryMap.topics.length > 0) {
            const memParts: string[] = [];
            if (memoryMap.topics.length > 0) {
                memParts.push('Topics: ' + memoryMap.topics.map(t => `${t.name} (${t.summary})`).join('; '));
            }
            if (memoryMap.decisions.length > 0) {
                memParts.push('Decisions: ' + memoryMap.decisions.map(d => `${d.what} — ${d.why}`).join('; '));
            }
            if (memoryMap.keyFacts.length > 0) {
                memParts.push('Key facts: ' + memoryMap.keyFacts.join('; '));
            }
            if (memoryMap.codeContext.length > 0) {
                memParts.push('Code context: ' + memoryMap.codeContext.map(c => `${c.language}: ${c.description}`).join('; '));
            }
            systemContent += '\n\n[CONVERSATION CONTEXT]\n' + memParts.join('\n');
        }

        // Inject RAG/web search only for direct user messages (skip for action prompts)
        const isDirectMessage = !actionType;
        let sourceIndex = 1;
        const collectedSources: SourceRef[] = [];

        if (isDirectMessage && settings.ragEnabled && settings.ragCollectionId) {
            try {
                const ragResults = await apiClient.rag.query(settings.ragCollectionId, text, 5);
                if (ragResults.results.length > 0) {
                    systemContent += '\n\n[KNOWLEDGE BASE]\n' + ragResults.results.map(r => {
                        const idx = sourceIndex++;
                        collectedSources.push({ index: idx, title: r.text.slice(0, 80) + (r.text.length > 80 ? '...' : ''), method: r.method || 'rag' });
                        return `[${idx}] ${r.text}`;
                    }).join('\n---\n');
                }
            } catch {
                // RAG query failed silently
            }
        }

        if (isDirectMessage && settings.webSearchEnabled) {
            try {
                const searchResults = await apiClient.search.web(text, 3, true);
                if (searchResults.length > 0) {
                    systemContent += '\n\n[WEB SEARCH]\n' + searchResults.map(r => {
                        const idx = sourceIndex++;
                        collectedSources.push({ index: idx, title: r.title, url: r.url, method: 'web' });
                        const body = r.content || r.snippet;
                        return `[${idx}] ${r.title}\n${body}\nSource: ${r.url}`;
                    }).join('\n---\n');
                }
            } catch {
                // web search failed silently
            }
        }

        // Add grounding instructions when context sources are present
        if (collectedSources.length > 0) {
            systemContent += '\n\nIMPORTANT: Base your answer on the provided sources above. Add inline citations like [1], [2] etc. referring to the numbered sources. If the sources don\'t contain enough information, say so.';
        }

        const systemMsg: Message | null = systemContent
            ? { role: 'system', content: systemContent }
            : null
        const conversation = [
            ...(systemMsg ? [systemMsg] : []),
            ...messages,
            userMsg
        ]
        setMessages(prev => [...prev, userMsg])
        if (!directPrompt) setInput('')
        setIsGenerating(true)

        const assistantMsgId = crypto.randomUUID()
        const initialAssistantMsg: Message = {
            role: 'assistant',
            content: '',
            id: assistantMsgId,
            sources: collectedSources.length > 0 ? collectedSources : undefined,
            stats: { tokensPerSecond: 0, timeToFirstToken: 0, totalTokens: 0 }
        }
        setMessages(prev => [...prev, initialAssistantMsg])

        try {
            const startTime = Date.now()
            let firstTokenTime = 0
            let tokenCount = 0

            const response = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_id: currentModelId,
                    messages: conversation.map(m => ({ role: m.role, content: m.content })),
                    temperature: settings.temperature,
                    max_tokens: settings.maxTokens,
                    top_p: settings.topP,
                    repetition_penalty: settings.repetitionPenalty
                })
            })

            if (!response.ok) {
                const errBody = await response.text()
                throw new Error(errBody || `HTTP ${response.status}`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let accumulated = ""
            let lineBuffer = ""

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    lineBuffer += decoder.decode(value, { stream: true })
                    const lines = lineBuffer.split('\n')
                    lineBuffer = lines.pop() ?? ''

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataString = line.slice(6).trim()
                            if (!dataString) continue

                            let data: any
                            try {
                                data = JSON.parse(dataString)
                            } catch {
                                continue
                            }

                            if (data.error) throw new Error(data.error)

                            if (data.text) {
                                if (tokenCount === 0) {
                                    firstTokenTime = (Date.now() - startTime) / 1000
                                }
                                accumulated += data.text
                                tokenCount++

                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? {
                                            ...m,
                                            content: accumulated,
                                            stats: {
                                                tokensPerSecond: parseFloat((tokenCount / ((Date.now() - startTime) / 1000)).toFixed(1)),
                                                timeToFirstToken: parseFloat(firstTokenTime.toFixed(2)),
                                                totalTokens: tokenCount
                                            }
                                        }
                                        : m
                                ))
                            }
                            if (data.done) break
                        }
                    }
                }
            }
        } catch (err: any) {
            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: `Error: ${err.message}` } : m
            ))
        } finally {
            setIsGenerating(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    }

    const codeActionPrompts: Record<string, (code: string, ctx?: string) => string> = {
        improve: (c) => `Improve the following code. Make it cleaner, more readable, and more idiomatic. Return ONLY the improved code inside a single code block, no explanation.\n\n\`\`\`\n${c}\n\`\`\``,
        secure: (c) => `Review the following code for security vulnerabilities. Fix any issues you find. Return ONLY the secured code inside a single code block, no explanation.\n\n\`\`\`\n${c}\n\`\`\``,
        faster: (c) => `Optimize the following code for performance. Return ONLY the optimized code inside a single code block, no explanation.\n\n\`\`\`\n${c}\n\`\`\``,
        docs: (c) => `Add documentation to the following code. Add docstrings, type hints, and inline comments where helpful. Do NOT change any logic. Return ONLY the documented code inside a single code block, no explanation.\n\n\`\`\`\n${c}\n\`\`\``,
        fix: (c, errors) => `Fix the syntax errors in the following code. The syntax checker reported:\n\n${errors}\n\nCode:\n\`\`\`\n${c}\n\`\`\`\n\nReturn ONLY the fixed code inside a single code block, no explanation.`,
    };

    // Inline rewrite: calls the model API directly, returns the rewritten code
    const rewriteSnippet = useCallback(async (code: string, action: string, context?: string): Promise<string> => {
        const buildPrompt = codeActionPrompts[action];
        if (!buildPrompt || !currentModelId) throw new Error('Cannot rewrite');
        const prompt = buildPrompt(code, context);
        const response = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model_id: currentModelId,
                messages: [{ role: 'user', content: prompt }],
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
            })
        });
        if (!response.ok) throw new Error('Rewrite request failed');
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let lineBuffer = '';
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                lineBuffer += decoder.decode(value, { stream: true });
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6).trim());
                            if (data.text) accumulated += data.text;
                            if (data.done) break;
                        } catch { continue; }
                    }
                }
            }
        }
        // Extract code from markdown fence
        const fenceMatch = accumulated.match(/```[\w]*\n([\s\S]*?)```/);
        return fenceMatch ? fenceMatch[1].trimEnd() : accumulated.trim();
    }, [currentModelId, settings.temperature, settings.maxTokens]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ethical self-assessment: ask the model to rate its own response
    const assessResponse = async (response: string, msgIndex: number) => {
        if (!currentModelId || assessments[msgIndex]) return;
        setAssessments(prev => ({ ...prev, [msgIndex]: 'loading' }));
        const prompt = `Rate the following AI response on a 0-100 scale for each category. Return ONLY valid JSON, nothing else.

Categories:
- privacy: Respects user data and privacy
- fairness: Free from bias and discrimination
- safety: No harmful, dangerous, or misleading content
- transparency: Clear about limitations and uncertainty
- ethics: Aligned with moral values and responsible AI
- reliability: Factually accurate and internally consistent

Response to assess:
---
${response.slice(0, 2000)}
---

Return exactly: {"privacy":N,"fairness":N,"safety":N,"transparency":N,"ethics":N,"reliability":N}`;

        try {
            const res = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_id: currentModelId,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 200,
                })
            });
            if (!res.ok) throw new Error('Assessment request failed');
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let lineBuffer = '';
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    lineBuffer += decoder.decode(value, { stream: true });
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6).trim());
                                if (data.text) accumulated += data.text;
                                if (data.done) break;
                            } catch { continue; }
                        }
                    }
                }
            }
            // Extract JSON from response (may be wrapped in markdown or text)
            const jsonMatch = accumulated.match(/\{[^}]*"privacy"\s*:\s*\d+[^}]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const clamp = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));
                const assessment: SelfAssessment = {
                    privacy: clamp(parsed.privacy),
                    fairness: clamp(parsed.fairness),
                    safety: clamp(parsed.safety),
                    transparency: clamp(parsed.transparency),
                    ethics: clamp(parsed.ethics),
                    reliability: clamp(parsed.reliability),
                };
                setAssessments(prev => ({ ...prev, [msgIndex]: assessment }));
            } else {
                throw new Error('No valid JSON in response');
            }
        } catch {
            setAssessments(prev => {
                const next = { ...prev };
                delete next[msgIndex];
                return next;
            });
        }
    };

    // Self-Critique: iterative critique→improve loop
    const handleSelfCritique = async (originalResponse: string, msgIndex: number) => {
        if (!currentModelId || selfCritiqueLoading[msgIndex]) return;
        setSelfCritiqueLoading(prev => ({ ...prev, [msgIndex]: true }));

        // Find the user question that preceded this response
        const userQuestion = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user')?.content || '';
        // Determine iterations based on context window size (smaller models get fewer)
        const contextWindow = activeModel?.context_window || 4096;
        const iterations = contextWindow >= 8192 ? 2 : 1;

        try {
            let currentResponse = originalResponse;
            for (let i = 0; i < iterations; i++) {
                // Step 1: Critique
                const critiquePrompt = `You are a strict reviewer. Analyze this AI response to the user's question and generate 3-5 pointed, specific critiques. Focus on accuracy, completeness, clarity, and missed aspects. Be direct and honest.

User question: ${userQuestion}

AI response: ${currentResponse}

Return ONLY the numbered critiques, nothing else.`;

                const critiqueResponse = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model_id: currentModelId,
                        messages: [{ role: 'user', content: critiquePrompt }],
                        temperature: 0.4,
                        max_tokens: Math.min(settings.maxTokens, 1024),
                    })
                });
                if (!critiqueResponse.ok) throw new Error('Critique step failed');
                let critique = '';
                const reader1 = critiqueResponse.body?.getReader();
                const decoder1 = new TextDecoder();
                let buf1 = '';
                if (reader1) {
                    while (true) {
                        const { done, value } = await reader1.read();
                        if (done) break;
                        buf1 += decoder1.decode(value, { stream: true });
                        const lines = buf1.split('\n');
                        buf1 = lines.pop() ?? '';
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try { const d = JSON.parse(line.slice(6)); if (d.text) critique += d.text; } catch { /* skip */ }
                            }
                        }
                    }
                }

                // Step 2: Improve
                const improvePrompt = `Rewrite and improve the following AI response, addressing ALL of these critiques. Return ONLY the improved response, nothing else.

Original question: ${userQuestion}

Original response: ${currentResponse}

Critiques to address:
${critique}

Improved response:`;

                const improveResponse = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model_id: currentModelId,
                        messages: [{ role: 'user', content: improvePrompt }],
                        temperature: 0.5,
                        max_tokens: settings.maxTokens,
                    })
                });
                if (!improveResponse.ok) throw new Error('Improve step failed');
                let improved = '';
                const reader2 = improveResponse.body?.getReader();
                const decoder2 = new TextDecoder();
                let buf2 = '';
                if (reader2) {
                    while (true) {
                        const { done, value } = await reader2.read();
                        if (done) break;
                        buf2 += decoder2.decode(value, { stream: true });
                        const lines = buf2.split('\n');
                        buf2 = lines.pop() ?? '';
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try { const d = JSON.parse(line.slice(6)); if (d.text) improved += d.text; } catch { /* skip */ }
                            }
                        }
                    }
                }
                currentResponse = improved.trim() || currentResponse;
            }

            // Append the improved response as a new assistant message
            const label = `*Self-Critique — ${iterations} iteration${iterations > 1 ? 's' : ''}*\n\n`;
            const improvedMsg: Message = {
                role: 'assistant',
                content: label + currentResponse,
                id: Date.now().toString(),
            };
            setMessages(prev => [...prev, improvedMsg]);
        } catch {
            // self-critique failed silently
        } finally {
            setSelfCritiqueLoading(prev => ({ ...prev, [msgIndex]: false }));
        }
    };

    // Semantic memory map: summarize recent messages into structured context
    const buildMemoryMap = useCallback(async (msgs: Message[], existingMemory: ConversationMemory | null) => {
        if (!currentModelId || memoryBuildingRef.current) return null;
        memoryBuildingRef.current = true;
        setMemoryBuilding(true);

        const lastIdx = existingMemory?.lastProcessedIndex ?? -1;
        const newMessages = msgs.slice(lastIdx + 1);
        if (newMessages.length < 2) { setMemoryBuilding(false); memoryBuildingRef.current = false; return null; }

        // Build a compact transcript of recent messages
        const transcript = newMessages.map((m, i) =>
            `[${lastIdx + 1 + i}] ${m.role}: ${m.content.slice(0, 300)}`
        ).join('\n');

        const existingContext = existingMemory
            ? `\nExisting context to merge with:\n${JSON.stringify(existingMemory, null, 0)}\n`
            : '';

        const prompt = `Analyze this conversation and return ONLY valid JSON summarizing it. Merge with any existing context provided.${existingContext}

Conversation:
---
${transcript.slice(0, 3000)}
---

Return exactly this JSON structure (no other text):
{"topics":[{"name":"short name","summary":"1 sentence","messageRange":[start,end]}],"codeContext":[{"language":"lang","description":"what it does","lastVersion":"brief"}],"decisions":[{"what":"what was decided","why":"why"}],"keyFacts":["fact1","fact2"]}`;

        try {
            const res = await fetch(`${apiClient.API_BASE}/api/engine/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_id: currentModelId,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 500,
                })
            });
            if (!res.ok) throw new Error('Memory map request failed');
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let lineBuffer = '';
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    lineBuffer += decoder.decode(value, { stream: true });
                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6).trim());
                                if (data.text) accumulated += data.text;
                                if (data.done) break;
                            } catch { continue; }
                        }
                    }
                }
            }
            // Extract JSON
            const jsonMatch = accumulated.match(/\{[\s\S]*"topics"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const memory: ConversationMemory = {
                    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
                    codeContext: Array.isArray(parsed.codeContext) ? parsed.codeContext : [],
                    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
                    keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
                    lastProcessedIndex: msgs.length - 1,
                };
                setMemoryMap(memory);
                return memory;
            }
        } catch {
            // memory map build failed silently
        } finally {
            setMemoryBuilding(false);
            memoryBuildingRef.current = false;
        }
        return null;
    }, [currentModelId]);

    const sendCodeAction = useCallback((code: string, _action: string) => {
        if (isGenerating || !currentModelId) return;
        // Tests go through chat (produces a separate file, not a rewrite)
        const prompt = `Write tests for the following code. Do NOT modify the original code. Generate a complete test file with good coverage of edge cases, typical usage, and error conditions. Use the most appropriate testing framework for the language.\n\n\`\`\`\n${code}\n\`\`\``;
        const lineCount = code.split('\n').length;
        const display = `**Tests** — ${lineCount} lines`;
        handleSend(prompt, display, 'tests');
    }, [isGenerating, currentModelId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Memoize ReactMarkdown components so CodeBlock instances are not remounted on unrelated re-renders
    const markdownComponents = useMemo(() => ({
        hr: () => <hr className="border-white/[0.03] my-3" />,
        code({ className, children }: { className?: string; children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            // Inline code (no language class, short, no newlines)
            if (!match && !codeString.includes('\n')) {
                return <code className="bg-white/5 px-1.5 py-0.5 rounded text-blue-300 text-[13px]">{children}</code>;
            }
            // Fenced code block
            return (
                <CodeBlock
                    code={codeString}
                    language={match?.[1] || ''}
                    onTestAction={sendCodeAction}
                    onRewrite={rewriteSnippet}
                    enabledActions={settings.enabledActions}
                    syntaxCheck={settings.syntaxCheck}
                    autoFixSyntax={settings.autoFixSyntax}
                    piiRedaction={settings.piiRedaction}
                />
            );
        },
        pre({ children }: { children?: React.ReactNode }) {
            // Let CodeBlock handle its own wrapper
            return <>{children}</>;
        }
    }), [sendCodeAction, rewriteSnippet, settings.enabledActions, settings.syntaxCheck, settings.autoFixSyntax, settings.piiRedaction]);

    const getTranslateLanguage = () => {
        if (settings.translateLanguage) return settings.translateLanguage;
        const browserLang = navigator.language.split('-')[0];
        const langName: Record<string, string> = { en: 'English', it: 'Italian', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ru: 'Russian', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish' };
        return langName[browserLang] || browserLang;
    };

    const sendResponseAction = (response: string, action: string) => {
        if (isGenerating || !currentModelId) return;
        const targetLang = getTranslateLanguage();

        const prompts: Record<string, string> = {
            longer: `Expand and elaborate on the following response. Add more detail, examples, and depth while keeping the same structure and meaning.\n\n---\n${response}\n---`,
            shorter: `Condense the following response to be much shorter and more concise. Keep only the essential points.\n\n---\n${response}\n---`,
            formal: `Rewrite the following response in a formal, professional tone. Keep the same content and meaning.\n\n---\n${response}\n---`,
            casual: `Rewrite the following response in a casual, friendly tone. Keep the same content and meaning.\n\n---\n${response}\n---`,
            technical: `Rewrite the following response in a precise, technical tone with proper terminology. Keep the same meaning.\n\n---\n${response}\n---`,
            translate: `Translate the following response to ${targetLang}. Preserve formatting, code blocks, and technical terms.\n\n---\n${response}\n---`,
            devil: `Act as a devil's advocate. Challenge, critique, and find flaws in the following response. Point out weak arguments, logical fallacies, missing perspectives, and potential risks. Be thorough but constructive.\n\n---\n${response}\n---`,
            perspective_ceo: `Rewrite the following response from the perspective of a pragmatic CEO focused on ROI, market impact, and business value. Keep the same core information but shift the framing.\n\n---\n${response}\n---`,
            perspective_child: `Explain the following response as if you were talking to an 8-year-old. Use simple words, analogies, and short sentences. Make it fun and easy to understand.\n\n---\n${response}\n---`,
            perspective_scientist: `Rewrite the following response from the perspective of a skeptical scientist. Demand evidence, question assumptions, note what's unproven, and suggest how claims could be tested.\n\n---\n${response}\n---`,
            perspective_poet: `Rewrite the following response in a poetic, literary style. Use metaphors, vivid imagery, and elegant prose while preserving the core meaning.\n\n---\n${response}\n---`,
        };
        const labels: Record<string, string> = {
            longer: 'Longer',
            shorter: 'Shorter',
            formal: 'Formal',
            casual: 'Casual',
            technical: 'Technical',
            translate: `Translate → ${targetLang}`,
            devil: "Devil's Advocate",
            perspective_ceo: 'CEO Perspective',
            perspective_child: 'ELI8',
            perspective_scientist: 'Scientist Perspective',
            perspective_poet: 'Poet Perspective',
        };
        const prompt = prompts[action];
        const wordCount = response.split(/\s+/).length;
        const display = `**${labels[action]}** — ${wordCount} words`;
        if (prompt) handleSend(prompt, display, action);
    }

    return (
        <div className="h-full flex flex-col text-white overflow-hidden pb-4">
            <PageHeader>
                <div className="flex items-center gap-2">
                    {messages.length > 0 && (
                        <button
                            onClick={handleNewConversation}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </button>
                    )}
                    {messages.length > 0 && (
                        <div className="relative group/export">
                            <button
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export
                            </button>
                            <div className="hidden group-hover/export:block absolute top-full left-0 pt-1 z-50">
                                <div className="bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 min-w-[110px]">
                                    <button
                                        onClick={() => handleExport('md')}
                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        Markdown
                                    </button>
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        JSON
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {settings.piiRedaction && messages.length > 0 && (
                        <div className="relative group/redact">
                            <button
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Shield className="w-3.5 h-3.5" />
                                Redact
                                {redactedCount !== null && (
                                    <span className="text-[10px] font-mono text-emerald-400 ml-1">{redactedCount}</span>
                                )}
                            </button>
                            <div className="hidden group-hover/redact:block absolute top-full left-0 pt-1 z-50">
                                <div className="bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
                                    <button
                                        onClick={() => handleRedactConversation('all')}
                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        Redact all
                                    </button>
                                    <button
                                        onClick={() => handleRedactConversation('outgoing')}
                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        My messages only
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={toggleSearch}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSearch ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        title="Search in conversation (Ctrl+F)"
                    >
                        <Search className="w-3.5 h-3.5" />
                        Search
                    </button>
                    {settings.memoryMapEnabled && (
                        <button
                            type="button"
                            onClick={() => setShowMemoryMap(!showMemoryMap)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showMemoryMap ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <Brain className="w-3.5 h-3.5" />
                            {memoryBuilding ? 'Building...' : 'Memory'}
                        </button>
                    )}
                    <button
                        onClick={toggleParams}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${paramsExpanded ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        Parameters
                    </button>
                </div>
            </PageHeader>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col overflow-hidden relative">

                    {/* Search Bar */}
                    {showSearch && (
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/30 shrink-0">
                            <Search size={14} className="text-gray-500 shrink-0" />
                            <input
                                ref={searchInputRef}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchMatches.length > 0) {
                                        const next = e.shiftKey
                                            ? (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length
                                            : (searchMatchIndex + 1) % searchMatches.length;
                                        setSearchMatchIndex(next);
                                        document.getElementById(`msg-${searchMatches[next]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                    if (e.key === 'Escape') toggleSearch();
                                }}
                                placeholder="Search in conversation..."
                                className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                            />
                            {searchQuery && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] text-gray-500 tabular-nums">
                                        {searchMatches.length > 0
                                            ? `${searchMatchIndex + 1}/${searchMatches.length}`
                                            : 'No results'}
                                    </span>
                                    {searchMatches.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    const prev = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
                                                    setSearchMatchIndex(prev);
                                                    document.getElementById(`msg-${searchMatches[prev]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }}
                                                className="p-0.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                                                title="Previous match (Shift+Enter)"
                                            >
                                                <ChevronUp size={14} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const next = (searchMatchIndex + 1) % searchMatches.length;
                                                    setSearchMatchIndex(next);
                                                    document.getElementById(`msg-${searchMatches[next]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }}
                                                className="p-0.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                                                title="Next match (Enter)"
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                            <button onClick={toggleSearch} className="text-gray-500 hover:text-white transition-colors shrink-0" title="Close search (Esc)">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div className="text-center max-w-md">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                                        <Cpu className="w-5 h-5 text-gray-500" />
                                    </div>
                                    <p className="text-sm text-gray-400 mb-1">
                                        {currentModelName
                                            ? <>Ready with <span className="text-gray-200 font-medium">{currentModelName}</span></>
                                            : 'No model loaded'
                                        }
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {currentModelId
                                            ? 'Type a message below. Shift+Enter for newlines.'
                                            : 'Load a model from the Models tab to start chatting.'
                                        }
                                    </p>

                                    {/* One-click model download walkthrough */}
                                    {!currentModelId && backendReady && walkthroughStep !== 'done' && (
                                        <div className="mt-6 p-4 bg-white/[0.02] border border-white/5 rounded-xl max-w-sm mx-auto">
                                            {walkthroughStep === 'idle' && (
                                                <>
                                                    <p className="text-xs text-gray-400 mb-3">No models yet? Get started in one click:</p>
                                                    <button
                                                        onClick={() => startWalkthrough('mlx-community/Qwen3-0.6B-4bit')}
                                                        className="w-full flex items-center gap-3 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors mb-2"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        Download Qwen 3 0.6B (0.4 GB)
                                                    </button>
                                                    <button
                                                        onClick={() => startWalkthrough('mlx-community/Llama-3.2-1B-Instruct-4bit')}
                                                        className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs transition-colors"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                        Or try Llama 3.2 1B (~0.7 GB)
                                                    </button>
                                                </>
                                            )}
                                            {walkthroughStep === 'downloading' && (
                                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin shrink-0" />
                                                    <div className="text-left">
                                                        <p className="font-medium">Downloading {walkthroughModel?.split('/').pop()}...</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">This may take a few minutes</p>
                                                    </div>
                                                </div>
                                            )}
                                            {walkthroughStep === 'loading' && (
                                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                                    <div className="w-5 h-5 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin shrink-0" />
                                                    <div className="text-left">
                                                        <p className="font-medium">Loading model into memory...</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">Almost ready</p>
                                                    </div>
                                                </div>
                                            )}
                                            {walkthroughStep === 'error' && (
                                                <div className="text-left">
                                                    <p className="text-sm text-red-400 mb-2">{walkthroughError}</p>
                                                    <button
                                                        onClick={() => { setWalkthroughStep('idle'); setWalkthroughError(null) }}
                                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                                    >
                                                        Try again
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-3xl mx-auto py-6 px-4">
                                {messages.map((msg, idx) => {
                                    let thinkingContent = '';
                                    let visibleContent = msg.content;

                                    if (msg.role === 'assistant') {
                                        const thinkMatch = msg.content.match(/<think>([\s\S]*?)(<\/think>|$)/);
                                        if (thinkMatch) {
                                            thinkingContent = thinkMatch[1].trim();
                                            visibleContent = msg.content.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim();
                                        }
                                    }

                                    if (msg.role === 'user') {
                                        // Icon map for action types
                                        const actionIcons: Record<string, React.ReactNode> = {
                                            improve: <Wand2 className="w-3.5 h-3.5" />,
                                            secure: <Shield className="w-3.5 h-3.5" />,
                                            faster: <Zap className="w-3.5 h-3.5" />,
                                            docs: <FileText className="w-3.5 h-3.5" />,
                                            tests: <TestTube2 className="w-3.5 h-3.5" />,
                                            longer: <Expand className="w-3.5 h-3.5" />,
                                            shorter: <Shrink className="w-3.5 h-3.5" />,
                                            formal: <Briefcase className="w-3.5 h-3.5" />,
                                            casual: <MessageCircle className="w-3.5 h-3.5" />,
                                            technical: <GraduationCap className="w-3.5 h-3.5" />,
                                            translate: <Languages className="w-3.5 h-3.5" />,
                                            devil: <Scale className="w-3.5 h-3.5" />,
                                            perspective_ceo: <User className="w-3.5 h-3.5" />,
                                            perspective_child: <Baby className="w-3.5 h-3.5" />,
                                            perspective_scientist: <FlaskConical className="w-3.5 h-3.5" />,
                                            perspective_poet: <Feather className="w-3.5 h-3.5" />,
                                        };
                                        const isLastMsg = idx === messages.length - 1 || (idx === messages.length - 2 && messages[messages.length - 1]?.role === 'assistant');
                                        const showSpinner = isLastMsg && isGenerating;

                                        const isSearchHit = searchQuery && searchMatches.includes(idx);
                                        const isActiveHit = isSearchHit && searchMatches[searchMatchIndex] === idx;

                                        return (
                                            <div key={idx} id={`msg-${idx}`} className={`mb-6 rounded-lg transition-colors ${isActiveHit ? 'bg-yellow-500/10 ring-1 ring-yellow-500/30' : isSearchHit ? 'bg-white/[0.02]' : ''}`}>
                                                <div className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                                                        <User size={14} className="text-gray-400" />
                                                    </div>
                                                    {msg.displayContent ? (
                                                        <details className="min-w-0 group/action">
                                                            <summary className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-gray-300 cursor-pointer select-none list-none hover:bg-white/[0.06] transition-colors">
                                                                <span className="text-blue-400 shrink-0">
                                                                    {(msg.actionType && actionIcons[msg.actionType]) || <Settings2 className="w-3.5 h-3.5" />}
                                                                </span>
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{ p: ({ children }) => <span>{children}</span> }}
                                                                >
                                                                    {msg.displayContent}
                                                                </ReactMarkdown>
                                                                {showSpinner && (
                                                                    <div className="w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin shrink-0 ml-1" />
                                                                )}
                                                                <ChevronRight className="w-3 h-3 text-gray-600 shrink-0 ml-auto transition-transform chevron-rotate" />
                                                            </summary>
                                                            <div className="mt-2 ml-1 pl-3 border-l border-white/5 text-xs text-gray-500 max-h-48 overflow-y-auto">
                                                                <pre className="whitespace-pre-wrap font-mono leading-relaxed">{msg.content}</pre>
                                                            </div>
                                                        </details>
                                                    ) : (
                                                        <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed prose-p:my-2 prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/5 prose-pre:rounded-lg prose-code:text-blue-300 prose-code:font-normal prose-headings:font-semibold prose-headings:text-gray-100 prose-hr:border-transparent min-w-0">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}
                                                                components={{ hr: () => <hr className="border-white/[0.03] my-3" /> }}
                                                            >
                                                                {msg.content}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    }

                                    const isSearchHitAst = searchQuery && searchMatches.includes(idx);
                                    const isActiveHitAst = isSearchHitAst && searchMatches[searchMatchIndex] === idx;

                                    return (
                                        <div key={idx} id={`msg-${idx}`} className={`mb-6 group rounded-lg transition-colors ${isActiveHitAst ? 'bg-yellow-500/10 ring-1 ring-yellow-500/30' : isSearchHitAst ? 'bg-white/[0.02]' : ''}`}>
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0 mt-1">
                                                    <Bot size={14} className="text-blue-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    {/* Reasoning trace */}
                                                    {thinkingContent && (
                                                        <details className="mb-3">
                                                            <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 hover:text-gray-400 transition-colors select-none py-0.5">
                                                                <ChevronRight className="w-3 h-3 transition-transform details-open:rotate-90" />
                                                                <span>Reasoning</span>
                                                                <span className="text-gray-600 ml-1">
                                                                    {thinkingContent.split(/\s+/).length} words
                                                                </span>
                                                            </summary>
                                                            <div className="mt-2 pl-4 border-l border-white/5 text-xs text-gray-500 leading-relaxed max-h-64 overflow-y-auto">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ hr: () => <hr className="border-white/[0.03] my-2" /> }}>
                                                                    {thinkingContent}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </details>
                                                    )}

                                                    {/* Response */}
                                                    <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed prose-p:my-2 prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-code:text-blue-300 prose-code:font-normal prose-headings:font-semibold prose-headings:text-gray-100 prose-hr:border-transparent">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm, remarkBreaks]}
                                                            components={markdownComponents}
                                                        >
                                                            {visibleContent}
                                                        </ReactMarkdown>
                                                    </div>

                                                    {/* Sources citations */}
                                                    {msg.sources && msg.sources.length > 0 && visibleContent && (
                                                        <details className="group mt-2 border border-white/5 rounded-lg overflow-hidden">
                                                            <summary className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-400 cursor-pointer select-none bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                                                <Database size={12} className="shrink-0" />
                                                                <span>{msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}</span>
                                                                <ChevronDown size={12} className="ml-auto group-open:rotate-180 transition-transform" />
                                                            </summary>
                                                            <div className="px-3 py-2 space-y-1.5 bg-white/[0.01]">
                                                                {msg.sources.map(src => (
                                                                    <div key={src.index} className="flex items-start gap-2 text-[11px]">
                                                                        <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-white/5 text-gray-500 font-mono text-[10px]">{src.index}</span>
                                                                        <div className="min-w-0 flex-1">
                                                                            {src.url ? (
                                                                                <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-400/80 hover:text-blue-300 truncate block" title={src.url}>{src.title}</a>
                                                                            ) : (
                                                                                <span className="text-gray-400 truncate block">{src.title}</span>
                                                                            )}
                                                                        </div>
                                                                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${src.method === 'web' ? 'bg-green-500/10 text-green-500/70' : 'bg-blue-500/10 text-blue-500/70'}`}>
                                                                            {src.method === 'web' ? 'web' : 'rag'}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}

                                                    {/* Footer: actions + stats, single row on hover */}
                                                    {visibleContent && (
                                                        <ResponseActions
                                                            content={visibleContent}
                                                            idx={idx}
                                                            copiedIndex={copiedIndex}
                                                            stats={msg.stats}
                                                            onAction={sendResponseAction}
                                                            onCopy={copyToClipboard}
                                                            showPrompt={settings.showPrompt}
                                                            fullPrompt={msg.content}
                                                            enabledActions={settings.enabledActions}
                                                            onBranch={activeConversationId ? () => handleBranch(idx) : undefined}
                                                            assessment={assessments[idx]}
                                                            onAssess={settings.enabledActions?.selfAssess !== false ? () => assessResponse(visibleContent, idx) : undefined}
                                                            onSelfCritique={settings.enabledActions?.selfCritique !== false ? () => handleSelfCritique(visibleContent, idx) : undefined}
                                                            selfCritiqueLoading={!!selfCritiqueLoading[idx]}
                                                            disabled={isGenerating}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Memory Map Panel */}
                    {showMemoryMap && settings.memoryMapEnabled && (
                        <MemoryMapPanel memory={memoryMap} building={memoryBuilding} />
                    )}

                    {/* Input Area */}
                    <div className="px-4 pb-2 pt-3">
                        <div className="max-w-3xl mx-auto">
                            {/* Input field */}
                            <div className="relative bg-white/[0.03] border border-white/10 rounded-xl focus-within:border-white/20 transition-colors">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isGenerating ? "Generating..." : "Send a message..."}
                                    disabled={isGenerating}
                                    className={`w-full bg-transparent px-4 py-3 pr-14 text-sm text-gray-200 placeholder-gray-600 outline-none resize-none min-h-[44px] max-h-[200px] ${isGenerating ? 'opacity-40' : ''}`}
                                    rows={1}
                                />
                                <div className="absolute right-2 bottom-2">
                                    {isGenerating ? (
                                        <button
                                            onClick={handleStop}
                                            className="p-1.5 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/15 transition-colors"
                                            title="Stop"
                                        >
                                            <Square className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSend()}
                                            disabled={!input.trim() || !currentModelId}
                                            title="Send message"
                                            className={`p-1.5 rounded-lg transition-colors ${input.trim() && currentModelId ? 'bg-white text-black hover:bg-gray-200' : 'bg-white/5 text-gray-700 cursor-not-allowed'}`}
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Parameters Sidebar — mirrors left sidebar style */}
                <div className={`${paramsExpanded ? 'w-72 border-l border-white/5 bg-black/40' : 'w-0'} flex flex-col shrink-0 transition-all duration-200 overflow-hidden`}>
                    {paramsExpanded ? (
                        <>
                            <nav className="flex-1 overflow-y-auto px-4 pt-6">
                                <div className="px-0 mb-4 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Parameters</div>
                                <div className="space-y-5">
                                    <ParameterSlider
                                        label="Temperature"
                                        value={settings.temperature}
                                        min={0} max={2} step={0.05}
                                        format={(v) => v.toFixed(2)}
                                        onChange={(v) => setSettings({ ...settings, temperature: v })}
                                    />
                                    <ParameterSlider
                                        label="Max Tokens"
                                        value={settings.maxTokens}
                                        min={64} max={activeModel?.context_window || 32768} step={64}
                                        format={(v) => v.toString()}
                                        onChange={(v) => setSettings({ ...settings, maxTokens: v })}
                                    />
                                    <ParameterSlider
                                        label="Top-P"
                                        value={settings.topP}
                                        min={0} max={1} step={0.05}
                                        format={(v) => v.toFixed(2)}
                                        onChange={(v) => setSettings({ ...settings, topP: v })}
                                    />
                                    <ParameterSlider
                                        label="Repetition Penalty"
                                        value={settings.repetitionPenalty}
                                        min={0.5} max={2} step={0.05}
                                        format={(v) => v.toFixed(2)}
                                        onChange={(v) => setSettings({ ...settings, repetitionPenalty: v })}
                                    />

                                    <div className="border-t border-white/5 pt-5">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Reasoning</div>
                                        <div className="flex gap-1">
                                            {(['off', 'auto', 'low', 'high'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setSettings({ ...settings, reasoningMode: mode })}
                                                    className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                                                        settings.reasoningMode === mode
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    {mode === 'off' ? 'Off' : mode === 'auto' ? 'Auto' : mode === 'low' ? 'Low' : 'High'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-gray-600 mt-1.5">
                                            {settings.reasoningMode === 'off' && 'No reasoning instructions added.'}
                                            {settings.reasoningMode === 'auto' && 'Let the model decide. Best for reasoning models.'}
                                            {settings.reasoningMode === 'low' && 'Brief reasoning before answering.'}
                                            {settings.reasoningMode === 'high' && 'Deep step-by-step reasoning.'}
                                        </p>
                                    </div>

                                    <div className="border-t border-white/5 pt-5">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Language</div>
                                        <select
                                            title="Translate Language"
                                            value={settings.translateLanguage}
                                            onChange={(e) => setSettings({ ...settings, translateLanguage: e.target.value })}
                                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
                                        >
                                            <option value="">Auto-detect (browser)</option>
                                            {['English', 'Italian', 'French', 'German', 'Spanish', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi', 'Russian', 'Dutch', 'Swedish', 'Polish', 'Turkish'].map(lang => (
                                                <option key={lang} value={lang}>{lang}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-gray-600 mt-1.5">Target language for the Translate action.</p>
                                    </div>

                                    <div className="border-t border-white/5 pt-5">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Toggles</div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">Show Prompt</label>
                                                <button
                                                    onClick={() => setSettings({ ...settings, showPrompt: !settings.showPrompt })}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.showPrompt
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    {settings.showPrompt ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                    {settings.showPrompt ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">Syntax Check</label>
                                                <button
                                                    onClick={() => setSettings({ ...settings, syntaxCheck: !settings.syntaxCheck })}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.syntaxCheck
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    {settings.syntaxCheck ? <CircleCheck className="w-3 h-3" /> : <CircleX className="w-3 h-3" />}
                                                    {settings.syntaxCheck ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                            {settings.syntaxCheck && (
                                                <div className="flex items-center justify-between pl-3">
                                                    <label className="text-xs text-gray-500">Auto-fix</label>
                                                    <button
                                                        onClick={() => setSettings({ ...settings, autoFixSyntax: !settings.autoFixSyntax })}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                            settings.autoFixSyntax
                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                        }`}
                                                    >
                                                        {settings.autoFixSyntax ? 'On' : 'Off'}
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">Memory Map</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setSettings({ ...settings, memoryMapEnabled: !settings.memoryMapEnabled })}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.memoryMapEnabled
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <Brain className="w-3 h-3" />
                                                    {settings.memoryMapEnabled ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                            {settings.memoryMapEnabled && (
                                                <div className="pl-3">
                                                    <ParameterSlider
                                                        label="Build every N messages"
                                                        value={settings.memoryInterval}
                                                        min={3} max={20} step={1}
                                                        format={(v) => v.toString()}
                                                        onChange={(v) => setSettings({ ...settings, memoryInterval: v })}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">PII Redaction</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setSettings({ ...settings, piiRedaction: !settings.piiRedaction })}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.piiRedaction
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <Shield className="w-3 h-3" />
                                                    {settings.piiRedaction ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-white/5 pt-5">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Context</div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">RAG Knowledge</label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = !settings.ragEnabled;
                                                        setSettings({ ...settings, ragEnabled: next });
                                                        if (next && ragCollections.length === 0) fetchRagCollections();
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.ragEnabled
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <Database className="w-3 h-3" />
                                                    {settings.ragEnabled ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                            {settings.ragEnabled && (
                                                <select
                                                    title="RAG collection"
                                                    value={settings.ragCollectionId}
                                                    onChange={(e) => setSettings({ ...settings, ragCollectionId: e.target.value })}
                                                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
                                                >
                                                    <option value="">Select collection...</option>
                                                    {ragCollections.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name} ({c.chunks} chunks)</option>
                                                    ))}
                                                </select>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">Web Search</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setSettings({ ...settings, webSearchEnabled: !settings.webSearchEnabled })}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                        settings.webSearchEnabled
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-400 hover:bg-white/5'
                                                    }`}
                                                >
                                                    <Globe className="w-3 h-3" />
                                                    {settings.webSearchEnabled ? 'On' : 'Off'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-white/5 pt-5">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">Actions</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { key: 'longer', label: 'Longer' },
                                                { key: 'shorter', label: 'Shorter' },
                                                { key: 'formal', label: 'Formal' },
                                                { key: 'casual', label: 'Casual' },
                                                { key: 'technical', label: 'Technical' },
                                                { key: 'translate', label: 'Translate' },
                                                { key: 'devil', label: "Devil's Advocate" },
                                                { key: 'perspective_ceo', label: 'CEO' },
                                                { key: 'perspective_child', label: 'ELI8' },
                                                { key: 'perspective_scientist', label: 'Scientist' },
                                                { key: 'perspective_poet', label: 'Poet' },
                                                { key: 'improve', label: 'Improve' },
                                                { key: 'secure', label: 'Secure' },
                                                { key: 'faster', label: 'Faster' },
                                                { key: 'docs', label: 'Docs' },
                                                { key: 'tests', label: 'Tests' },
                                                { key: 'selfAssess', label: 'Ethical' },
                                                { key: 'selfCritique', label: 'Self-Critique' },
                                            ].map(a => {
                                                const enabled = settings.enabledActions?.[a.key] !== false;
                                                return (
                                                    <button
                                                        key={a.key}
                                                        onClick={() => setSettings({
                                                            ...settings,
                                                            enabledActions: { ...settings.enabledActions, [a.key]: !enabled },
                                                        })}
                                                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                                            enabled
                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                : 'bg-white/[0.03] text-gray-600 border border-white/5 hover:text-gray-400'
                                                        }`}
                                                    >
                                                        {a.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="border-t border-white/5 pt-5 pb-4">
                                        <div className="px-0 mb-3 text-[10px] font-bold tracking-wide text-gray-500 uppercase">System Prompt</div>
                                        <textarea
                                            value={settings.systemPrompt}
                                            onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-3 text-xs text-gray-300 h-28 resize-none outline-none focus:border-white/20 transition-colors leading-relaxed"
                                            placeholder="Set model behavior..."
                                        />
                                    </div>
                                </div>
                            </nav>

                            {/* Collapse toggle — mirrors left sidebar */}
                            <button
                                onClick={toggleParams}
                                className={`mx-auto mb-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0 ml-auto mr-4`}
                                title="Collapse parameters"
                            >
                                <ChevronsRight size={16} />
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function ResponseActions({
    content,
    idx,
    copiedIndex,
    stats,
    onAction,
    onCopy,
    showPrompt,
    fullPrompt,
    enabledActions,
    onBranch,
    assessment,
    onAssess,
    onSelfCritique,
    selfCritiqueLoading,
    disabled,
}: {
    content: string;
    idx: number;
    copiedIndex: number | null;
    stats?: { tokensPerSecond: number; timeToFirstToken: number; totalTokens: number };
    onAction: (response: string, action: string) => void;
    onCopy: (text: string, index: number) => void;
    showPrompt: boolean;
    fullPrompt: string;
    enabledActions?: Record<string, boolean>;
    onBranch?: () => void;
    assessment?: SelfAssessment | 'loading';
    onAssess?: () => void;
    onSelfCritique?: () => void;
    selfCritiqueLoading?: boolean;
    disabled?: boolean;
}) {
    const isOn = (key: string) => enabledActions?.[key] !== false;
    const [showPerspectives, setShowPerspectives] = useState(false);
    const [showAssessment, setShowAssessment] = useState(false);
    const [promptDetailsOpen, setPromptDetailsOpen] = useState(false);
    const prevAssessmentRef = useRef(assessment);
    const perspRef = useRef<HTMLDivElement>(null);
    const assessRef = useRef<HTMLDivElement>(null);

    // Auto-show panel when assessment finishes loading
    useEffect(() => {
        if (prevAssessmentRef.current === 'loading' && assessment && assessment !== 'loading') {
            setShowAssessment(true);
        }
        prevAssessmentRef.current = assessment;
    }, [assessment]);

    // Close perspectives dropdown on outside click
    useEffect(() => {
        if (!showPerspectives) return;
        const handler = (e: MouseEvent) => {
            if (perspRef.current && !perspRef.current.contains(e.target as Node)) {
                setShowPerspectives(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showPerspectives]);

    // Close assessment popover on outside click
    useEffect(() => {
        if (!showAssessment) return;
        const handler = (e: MouseEvent) => {
            if (assessRef.current && !assessRef.current.contains(e.target as Node)) {
                setShowAssessment(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAssessment]);

    const perspectives = [
        { key: 'perspective_ceo', label: 'CEO', icon: <User className="w-3 h-3" /> },
        { key: 'perspective_child', label: 'ELI8', icon: <Baby className="w-3 h-3" /> },
        { key: 'perspective_scientist', label: 'Scientist', icon: <FlaskConical className="w-3 h-3" /> },
        { key: 'perspective_poet', label: 'Poet', icon: <Feather className="w-3 h-3" /> },
    ];
    const enabledPerspectives = perspectives.filter(p => isOn(p.key));

    // Once assessment scores are loaded, the inline bar is always visible
    const hasScores = assessment && assessment !== 'loading';
    const hasVisiblePanel =
        hasScores ||
        (showPrompt && promptDetailsOpen) ||
        showPerspectives;

    return (
        <div className={`mt-2 transition-opacity ${hasVisiblePanel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <div className="flex items-center gap-0.5">
                {/* Tone & length actions */}
                {[
                    { key: 'longer', label: 'Longer', icon: <Expand className="w-3 h-3" /> },
                    { key: 'shorter', label: 'Shorter', icon: <Shrink className="w-3 h-3" /> },
                    { key: 'formal', label: 'Formal', icon: <Briefcase className="w-3 h-3" /> },
                    { key: 'casual', label: 'Casual', icon: <MessageCircle className="w-3 h-3" /> },
                    { key: 'technical', label: 'Technical', icon: <GraduationCap className="w-3 h-3" /> },
                    { key: 'translate', label: 'Translate', icon: <Languages className="w-3 h-3" /> },
                ].filter(a => isOn(a.key)).map(a => (
                    <button
                        key={a.key}
                        onClick={() => onAction(content, a.key)}
                        disabled={disabled}
                        className={`p-1 rounded transition-colors ${disabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-600 hover:text-gray-300 hover:bg-white/5'}`}
                        title={disabled ? 'Wait for response...' : a.label}
                    >
                        {a.icon}
                    </button>
                ))}
                {(isOn('devil') || enabledPerspectives.length > 0) && <div className="w-px h-3 bg-white/10 mx-1" />}
                {/* Devil's Advocate */}
                {isOn('devil') && (
                    <button
                        onClick={() => onAction(content, 'devil')}
                        disabled={disabled}
                        className={`p-1 rounded transition-colors ${disabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-600 hover:text-orange-400 hover:bg-orange-500/5'}`}
                        title={disabled ? 'Wait for response...' : "Devil's Advocate"}
                    >
                        <Scale className="w-3 h-3" />
                    </button>
                )}
                {/* Perspective Shift dropdown */}
                {enabledPerspectives.length > 0 && (
                    <div className="relative" ref={perspRef}>
                        <button
                            onClick={() => !disabled && setShowPerspectives(!showPerspectives)}
                            disabled={disabled}
                            className={`p-1 rounded transition-colors ${disabled ? 'text-gray-700 cursor-not-allowed' : showPerspectives ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-blue-400 hover:bg-blue-500/5'}`}
                            title={disabled ? 'Wait for response...' : "Change Perspective"}
                        >
                            <Eye className="w-3 h-3" />
                        </button>
                        {showPerspectives && (
                            <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 z-50 min-w-[120px]">
                                {enabledPerspectives.map(p => (
                                    <button
                                        key={p.key}
                                        onClick={() => { onAction(content, p.key); setShowPerspectives(false); }}
                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        {p.icon}
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="w-px h-3 bg-white/10 mx-1" />
                <button
                    onClick={() => onCopy(content, idx)}
                    className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title="Copy response"
                >
                    {copiedIndex === idx
                        ? <Check className="w-3 h-3 text-green-500" />
                        : <Copy className="w-3 h-3" />
                    }
                </button>
                {onBranch && (
                    <button
                        onClick={onBranch}
                        disabled={disabled}
                        className={`p-1 rounded transition-colors ${disabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-600 hover:text-blue-400 hover:bg-blue-500/5'}`}
                        title={disabled ? 'Wait for response...' : "Branch from here"}
                    >
                        <GitFork className="w-3 h-3" />
                    </button>
                )}
                {/* Ethical self-assessment */}
                {onAssess && (
                    <div className="relative flex items-center" ref={assessRef}>
                        <button
                            onClick={() => {
                                if (!assessment) onAssess();
                                else setShowAssessment(!showAssessment);
                            }}
                            className={`p-1 rounded transition-colors ${
                                assessment && assessment !== 'loading'
                                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                                    : assessment === 'loading'
                                        ? 'text-gray-500 cursor-wait'
                                        : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/5'
                            }`}
                            title={assessment === 'loading' ? 'Assessing...' : assessment ? 'Click for details' : 'Ethical assessment'}
                            disabled={assessment === 'loading'}
                        >
                            {assessment === 'loading'
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <ShieldCheck className="w-3 h-3" />
                            }
                        </button>
                        {/* Inline compact score */}
                        {assessment && assessment !== 'loading' && (() => {
                            const dims: (keyof SelfAssessment)[] = ['privacy', 'fairness', 'safety', 'transparency', 'ethics', 'reliability'];
                            const avg = Math.round(dims.reduce((s, k) => s + assessment[k], 0) / dims.length);
                            const color = avg >= 80 ? 'bg-emerald-500' : avg >= 60 ? 'bg-yellow-500' : avg >= 40 ? 'bg-orange-500' : 'bg-red-500';
                            const textColor = avg >= 80 ? 'text-emerald-400' : avg >= 60 ? 'text-yellow-400' : avg >= 40 ? 'text-orange-400' : 'text-red-400';
                            return (
                                <button
                                    onClick={() => setShowAssessment(!showAssessment)}
                                    className="flex items-center gap-1.5 ml-0.5 px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                                    title="Click for details"
                                >
                                    <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${color}`} style={{ width: `${avg}%` }} />
                                    </div>
                                    <span className={`text-[10px] font-mono font-medium ${textColor}`}>{avg}</span>
                                </button>
                            );
                        })()}
                        {/* Detail popover */}
                        {showAssessment && assessment && assessment !== 'loading' && (
                            <AssessmentPopover scores={assessment} />
                        )}
                    </div>
                )}
                {/* Self-Critique */}
                {onSelfCritique && isOn('selfCritique') && (
                    <button
                        type="button"
                        onClick={onSelfCritique}
                        disabled={disabled || selfCritiqueLoading}
                        className={`p-1 rounded transition-colors ${
                            selfCritiqueLoading
                                ? 'text-amber-400 cursor-wait'
                                : disabled
                                    ? 'text-gray-700 cursor-not-allowed'
                                    : 'text-gray-600 hover:text-amber-400 hover:bg-amber-500/5'
                        }`}
                        title={selfCritiqueLoading ? 'Critiquing...' : disabled ? 'Wait for response...' : 'Self-Critique (iterative improvement)'}
                    >
                        {selfCritiqueLoading
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RefreshCcw className="w-3 h-3" />
                        }
                    </button>
                )}
                {/* Stats inline */}
                {stats && stats.totalTokens > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                        <span className="text-[10px] text-gray-600 font-mono tabular-nums">
                            {stats.tokensPerSecond} tok/s
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono tabular-nums">
                            {stats.totalTokens} tok
                        </span>
                    </div>
                )}
            </div>
            {/* Show Prompt — what was actually sent */}
            {showPrompt && (
                <details className="mt-1.5" onToggle={(e) => setPromptDetailsOpen(e.currentTarget.open)}>
                    <summary className="flex items-center gap-1 cursor-pointer text-[10px] text-gray-600 hover:text-gray-400 transition-colors select-none list-none">
                        <ChevronRight className="w-2.5 h-2.5 chevron-rotate transition-transform" />
                        <span>View raw response</span>
                    </summary>
                    <div className="mt-1 pl-3 border-l border-white/5 text-[10px] text-gray-600 max-h-32 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-mono leading-relaxed">{fullPrompt}</pre>
                    </div>
                </details>
            )}
        </div>
    );
}

function AssessmentPopover({ scores }: { scores: SelfAssessment }) {
    const dimensions: { key: keyof SelfAssessment; label: string }[] = [
        { key: 'privacy', label: 'Privacy' },
        { key: 'fairness', label: 'Fairness' },
        { key: 'safety', label: 'Safety' },
        { key: 'transparency', label: 'Transparency' },
        { key: 'ethics', label: 'Ethics' },
        { key: 'reliability', label: 'Reliability' },
    ];
    const barColor = (v: number) =>
        v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-yellow-500' : v >= 40 ? 'bg-orange-500' : 'bg-red-500';

    return (
        <div className="absolute bottom-full left-0 mb-1 p-2.5 rounded-lg bg-[#1a1a1a] border border-white/10 shadow-xl z-50 min-w-[220px]">
            <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-gray-400">Self-Assessment</span>
            </div>
            <div className="space-y-1.5">
                {dimensions.map(d => (
                    <div key={d.key} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-[76px] shrink-0">{d.label}</span>
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${barColor(scores[d.key])}`}
                                style={{ width: `${scores[d.key]}%` }}
                            />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{scores[d.key]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MemoryMapPanel({ memory, building }: { memory: ConversationMemory | null; building: boolean }) {
    if (building && !memory) {
        return (
            <div className="px-4 py-2">
                <div className="max-w-3xl mx-auto flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    <span className="text-xs text-gray-500">Building memory map...</span>
                </div>
            </div>
        );
    }
    if (!memory || memory.topics.length === 0) {
        return (
            <div className="px-4 py-2">
                <div className="max-w-3xl mx-auto p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2">
                        <Brain className="w-3.5 h-3.5 text-gray-600" />
                        <span className="text-xs text-gray-600">No memory context yet. Keep chatting and it will build automatically.</span>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="px-4 py-2">
            <div className="max-w-3xl mx-auto p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-medium text-gray-400">Conversation Memory</span>
                    {building && <Loader2 className="w-3 h-3 text-blue-400 animate-spin ml-auto" />}
                </div>
                {memory.topics.length > 0 && (
                    <div>
                        <span className="text-[10px] text-gray-500 font-medium">Topics</span>
                        <div className="mt-1 space-y-0.5">
                            {memory.topics.map((t, i) => (
                                <div key={i} className="text-[10px] text-gray-400">
                                    <span className="text-gray-300 font-medium">{t.name}</span>
                                    <span className="text-gray-600"> — {t.summary}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {memory.decisions.length > 0 && (
                    <div>
                        <span className="text-[10px] text-gray-500 font-medium">Decisions</span>
                        <div className="mt-1 space-y-0.5">
                            {memory.decisions.map((d, i) => (
                                <div key={i} className="text-[10px] text-gray-400">
                                    <span className="text-gray-300">{d.what}</span>
                                    <span className="text-gray-600"> — {d.why}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {memory.codeContext.length > 0 && (
                    <div>
                        <span className="text-[10px] text-gray-500 font-medium">Code</span>
                        <div className="mt-1 space-y-0.5">
                            {memory.codeContext.map((c, i) => (
                                <div key={i} className="text-[10px] text-gray-400">
                                    <span className="text-blue-400 font-mono">{c.language}</span>
                                    <span className="text-gray-600"> — {c.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {memory.keyFacts.length > 0 && (
                    <div>
                        <span className="text-[10px] text-gray-500 font-medium">Key Facts</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {memory.keyFacts.map((f, i) => (
                                <span key={i} className="text-[10px] text-gray-400 bg-white/[0.03] px-1.5 py-0.5 rounded">
                                    {f}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Strip ANSI escape sequences from error output
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

// Lightweight PII redaction — regex patterns for common PII types
const PII_PATTERNS: [RegExp, string][] = [
    [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]'],
    [/\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],
    [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]'],
    [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]'],
    [/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN]'],
    [/\b(?:sk-|ghp_|gho_|glpat-|xoxb-|xoxp-)[A-Za-z0-9_-]{20,}\b/g, '[KEY]'],
];

function redactPII(text: string): { text: string; count: number } {
    let count = 0;
    let result = text;
    for (const [pattern, replacement] of PII_PATTERNS) {
        result = result.replace(new RegExp(pattern.source, pattern.flags), () => { count++; return replacement; });
    }
    return { text: result, count };
}

interface SnippetVersion {
    code: string;
    action: string;
    timestamp: number;
}

function CodeBlock({
    code,
    language,
    onTestAction,
    onRewrite,
    enabledActions,
    syntaxCheck,
    autoFixSyntax,
    piiRedaction,
}: {
    code: string;
    language: string;
    onTestAction: (code: string, action: string) => void;
    onRewrite: (code: string, action: string, context?: string) => Promise<string>;
    enabledActions?: Record<string, boolean>;
    syntaxCheck?: boolean;
    autoFixSyntax?: boolean;
    piiRedaction?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<SandboxResult | null>(null);
    const [showOutput, setShowOutput] = useState(false);
    const runIdRef = useRef<string | null>(null);
    const [checkResult, setCheckResult] = useState<SyntaxCheckResult | null>(null);
    const [checking, setChecking] = useState(false);
    const checkRanRef = useRef(false);

    // Versioning state
    const [versions, setVersions] = useState<SnippetVersion[]>([]);
    const [versionIndex, setVersionIndex] = useState(-1);
    const [rewriting, setRewriting] = useState(false);

    // The code to display: active version or original
    const displayCode = versionIndex >= 0 && versions[versionIndex] ? versions[versionIndex].code : code;
    const totalVersions = versions.length;
    const displayVersionNum = versionIndex >= 0 ? versionIndex + 1 : (totalVersions > 0 ? 0 : -1);

    // Languages too vague for meaningful syntax checking
    const skipLangs = new Set(['', 'code', 'text', 'txt', 'output', 'plaintext', 'log', 'console', 'terminal', 'stdout', 'stderr']);

    // Auto-run syntax check on mount (only for blocks > 2 lines with a real language)
    useEffect(() => {
        if (!syntaxCheck || checkRanRef.current || code.split('\n').length <= 2 || skipLangs.has(language.toLowerCase())) return;
        checkRanRef.current = true;
        setChecking(true);
        apiClient.sandbox.check(code, language)
            .then(setCheckResult)
            .catch(() => {})
            .finally(() => setChecking(false));
    }, [syntaxCheck, code, language]);

    // Re-check syntax when version changes
    useEffect(() => {
        if (!syntaxCheck || versionIndex < 0 || displayCode.split('\n').length <= 2 || skipLangs.has(language.toLowerCase())) return;
        setChecking(true);
        setCheckResult(null);
        apiClient.sandbox.check(displayCode, language)
            .then(setCheckResult)
            .catch(() => {})
            .finally(() => setChecking(false));
    }, [versionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCopy = () => {
        navigator.clipboard.writeText(displayCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRun = async () => {
        setRunning(true);
        setShowOutput(true);
        setResult(null);
        try {
            const res = await apiClient.sandbox.run(displayCode, language);
            runIdRef.current = res.run_id;
            setResult(res);
        } catch (e: any) {
            setResult({
                stdout: '',
                stderr: e.message || 'Execution failed',
                exit_code: 1,
                execution_time: 0,
                language: language || 'unknown',
                timed_out: false,
                run_id: '',
            });
        } finally {
            setRunning(false);
        }
    };

    const handleKill = async () => {
        if (runIdRef.current) {
            try { await apiClient.sandbox.kill(runIdRef.current); } catch { /* ignore */ }
        }
    };

    const handleInlineRewrite = async (action: string, context?: string) => {
        if (rewriting) return;
        setRewriting(true);
        try {
            const sourceCode = displayCode;
            const result = await onRewrite(sourceCode, action, context);
            // Initialize with original if first rewrite
            const current = versions.length === 0
                ? [{ code, action: 'original', timestamp: Date.now() }]
                : [...versions];
            // Truncate any "future" versions if user navigated back then rewrote
            const base = versionIndex >= 0 ? current.slice(0, versionIndex + 1) : current;
            const updated = [...base, { code: result, action, timestamp: Date.now() }];
            setVersions(updated);
            setVersionIndex(updated.length - 1);
        } catch {
            // rewrite failed silently
        } finally {
            setRewriting(false);
        }
    };

    const handleRedactCode = () => {
        const { text, count } = redactPII(displayCode);
        if (count === 0 || text === displayCode) return;
        const current = versions.length === 0
            ? [{ code, action: 'original', timestamp: Date.now() }]
            : [...versions];
        const base = versionIndex >= 0 ? current.slice(0, versionIndex + 1) : current;
        const updated = [...base, { code: text, action: 'redact', timestamp: Date.now() }];
        setVersions(updated);
        setVersionIndex(updated.length - 1);
    };

    const rewriteActions = [
        { key: 'improve', label: 'Improve', icon: <Wand2 className="w-3 h-3" /> },
        { key: 'secure', label: 'Secure', icon: <Shield className="w-3 h-3" /> },
        { key: 'faster', label: 'Faster', icon: <Zap className="w-3 h-3" /> },
        { key: 'docs', label: 'Docs', icon: <FileText className="w-3 h-3" /> },
    ].filter(a => enabledActions?.[a.key] !== false);

    const showTests = enabledActions?.['tests'] !== false;
    const hasOutput = result && (result.stdout || result.stderr);

    return (
        <div className="rounded-lg border border-white/5 bg-black/30 overflow-hidden my-3 group/code">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/5">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-gray-500">{language || 'code'}</span>
                    {checking && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
                    {!checking && checkResult && !checkResult.skipped && (
                        checkResult.valid
                            ? <span title="Syntax valid"><CircleCheck className="w-3 h-3 text-green-500" /></span>
                            : <span title={stripAnsi(checkResult.errors) || 'Syntax error'}><CircleX className="w-3 h-3 text-red-400" /></span>
                    )}
                    {rewriting && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                    {/* Version navigation */}
                    {totalVersions > 0 && (
                        <div className="flex items-center gap-0.5 ml-1">
                            <button
                                onClick={() => setVersionIndex(Math.max(versionIndex - 1, -1))}
                                disabled={versionIndex <= -1}
                                className={`p-0.5 rounded transition-colors ${versionIndex > -1 ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-700 cursor-default'}`}
                                title="Previous version"
                            >
                                <ChevronLeft className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono text-gray-500 min-w-[32px] text-center">
                                {versionIndex < 0 ? 'orig' : `v${displayVersionNum}`}/{totalVersions}
                            </span>
                            <button
                                onClick={() => setVersionIndex(Math.min(versionIndex + 1, totalVersions - 1))}
                                disabled={versionIndex >= totalVersions - 1}
                                className={`p-0.5 rounded transition-colors ${versionIndex < totalVersions - 1 ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-700 cursor-default'}`}
                                title="Next version"
                            >
                                <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    {/* Run button */}
                    {running ? (
                        <button
                            onClick={handleKill}
                            title="Kill process"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <Square className="w-3 h-3 fill-current" />
                            <span>Kill</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleRun}
                            title="Run code"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-green-400 hover:bg-green-500/10 transition-colors"
                        >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Run</span>
                        </button>
                    )}
                    <div className="w-px h-3 bg-white/10 mx-1" />
                    {/* Inline rewrite actions */}
                    {rewriteActions.map(a => (
                        <button
                            key={a.key}
                            onClick={() => handleInlineRewrite(a.key)}
                            title={rewriting ? 'Rewriting...' : a.label}
                            disabled={rewriting}
                            className={`p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors ${rewriting ? 'opacity-30 cursor-wait' : 'opacity-0 group-hover/code:opacity-100'}`}
                        >
                            {a.icon}
                        </button>
                    ))}
                    {/* Tests (goes through chat) */}
                    {showTests && (
                        <button
                            onClick={() => onTestAction(displayCode, 'tests')}
                            title="Tests"
                            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors opacity-0 group-hover/code:opacity-100"
                        >
                            <TestTube2 className="w-3 h-3" />
                        </button>
                    )}
                    {piiRedaction && (
                        <button
                            onClick={handleRedactCode}
                            title="Redact PII"
                            className="p-1 rounded text-gray-600 hover:text-orange-400 hover:bg-orange-500/5 transition-colors opacity-0 group-hover/code:opacity-100"
                        >
                            <Shield className="w-3 h-3" />
                        </button>
                    )}
                    <div className="w-px h-3 bg-white/10 mx-1 opacity-0 group-hover/code:opacity-100" />
                    <button
                        onClick={handleCopy}
                        title="Copy code"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    >
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>
            </div>
            {/* Code content */}
            <pre className="p-4 overflow-x-auto">
                <code className="text-sm font-mono text-blue-300 leading-relaxed">{displayCode}</code>
            </pre>
            {/* Version action label */}
            {versionIndex >= 0 && versions[versionIndex] && versions[versionIndex].action !== 'original' && (
                <div className="px-3 py-1 border-t border-white/5 bg-white/[0.02]">
                    <span className="text-[10px] text-gray-500">
                        {versions[versionIndex].action} rewrite
                    </span>
                </div>
            )}
            {/* Syntax errors */}
            {checkResult && !checkResult.valid && !checkResult.skipped && (
                <div className="border-t border-red-500/10 bg-red-500/[0.03] px-3 py-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-red-400">Syntax error</span>
                        {autoFixSyntax && (
                            <button
                                onClick={() => handleInlineRewrite('fix', stripAnsi(checkResult.errors))}
                                disabled={rewriting}
                                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${rewriting ? 'bg-red-500/5 text-red-400/50 cursor-wait' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
                            >
                                {rewriting ? 'Fixing...' : 'Fix syntax'}
                            </button>
                        )}
                    </div>
                    {checkResult.errors && (
                        <pre className="text-[10px] font-mono text-red-400/70 mt-1 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                            {stripAnsi(checkResult.errors)}
                        </pre>
                    )}
                </div>
            )}
            {/* Sandbox output */}
            {showOutput && (
                <div className="border-t border-white/5">
                    <div className="flex items-center justify-between px-3 py-1 bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-gray-500">Output</span>
                            {running && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                            {result && (
                                <>
                                    <span className={`text-[10px] font-mono ${result.exit_code === 0 ? 'text-green-500' : 'text-red-400'}`}>
                                        exit {result.exit_code}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-600">
                                        {result.execution_time}s
                                    </span>
                                    {result.timed_out && (
                                        <span className="text-[10px] text-yellow-500">timeout</span>
                                    )}
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => { setShowOutput(false); setResult(null); }}
                            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                    {hasOutput && (
                        <pre className="px-4 py-3 overflow-x-auto max-h-48 overflow-y-auto text-xs font-mono leading-relaxed">
                            {result.stdout && <span className="text-gray-300">{result.stdout}</span>}
                            {result.stderr && <span className="text-red-400/80">{result.stderr}</span>}
                        </pre>
                    )}
                    {running && !hasOutput && (
                        <div className="px-4 py-3 text-xs text-gray-600">Running...</div>
                    )}
                </div>
            )}
        </div>
    );
}

function ParameterSlider({
    label, value, min, max, step, format, onChange
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');

    const applyValue = () => {
        const parsed = parseFloat(editValue);
        if (!isNaN(parsed)) {
            onChange(Math.min(max, Math.max(min, parsed)));
        }
        setEditing(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs text-gray-500">{label}</label>
                <input
                    type="text"
                    title={label}
                    value={editing ? editValue : format(value)}
                    onFocus={(e) => { setEditing(true); setEditValue(String(value)); e.target.select(); }}
                    onBlur={applyValue}
                    onKeyDown={(e) => { if (e.key === 'Enter') { applyValue(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setEditing(false); } }}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-16 text-right text-xs font-mono text-gray-400 tabular-nums bg-transparent outline-none border-b border-transparent focus:border-white/20 transition-colors"
                />
            </div>
            <input
                type="range"
                title={label}
                min={min} max={max} step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white/50"
            />
        </div>
    )
}
