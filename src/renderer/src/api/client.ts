export const API_BASE = 'http://127.0.0.1:8000'

// --- Shared Types ---

export interface SystemStats {
    memory: { total: number; available: number; used: number; percent: number }
    disk: { total: number; free: number; used: number; percent: number }
    cpu: { percent: number; cores: number }
    platform: { system: string; processor: string; release: string }
}

export interface PreviewRow {
    [key: string]: string | number | boolean | null
}

export interface ModelEntry {
    id: string
    name: string
    size: string
    family?: string
    architecture?: string
    context_window?: string
    quantization?: string
    url?: string
    external?: boolean
    is_custom?: boolean
    is_finetuned?: boolean
    downloaded: boolean
    downloading: boolean
    local_path: string | null
    path?: string
    base_model?: string
    adapter_path?: string
    params?: Record<string, unknown>
}

export interface JobStatus {
    status: 'starting' | 'training' | 'completed' | 'failed' | 'not_found'
    progress: number
    job_name?: string
    job_id?: string
    model_path?: string
    error?: string
    loss?: number
}

export interface ConvertResult {
    status: string
    rows_processed: number
    rows_skipped: number
    validation_errors: string[]
    output_path: string
}

export interface RagCollection {
    id: string
    name: string
    chunks: number
    size: string
    lastUpdated: string
    model: string
}

export interface AgentDefinition {
    id?: string
    name: string
    nodes: Record<string, unknown>[]
    edges: Record<string, unknown>[]
    config?: Record<string, unknown>
}

export interface AgentExecutionResult {
    agent_id: string
    status: string
    execution_time: number
    steps: { node_id: string; node_name: string; status: string; timestamp: number; output: string }[]
}

export interface ConversationMessage {
    id?: string
    role: 'system' | 'user' | 'assistant'
    content: string
    displayContent?: string
    actionType?: string
    stats?: { tokensPerSecond: number; timeToFirstToken: number; totalTokens: number }
}

export interface ConversationSummary {
    id: string
    title: string
    model_id: string | null
    created_at: string
    updated_at: string
    message_count: number
    pinned: boolean
    match_context?: string
    branched_from?: { conversation_id: string; message_index: number }
}

export interface Conversation extends ConversationSummary {
    messages: ConversationMessage[]
}

export interface SandboxResult {
    stdout: string
    stderr: string
    exit_code: number
    execution_time: number
    language: string
    timed_out: boolean
    run_id: string
}

export interface SyntaxCheckResult {
    valid: boolean
    errors: string
    language: string
    skipped: boolean
}

export interface SelfAssessment {
    privacy: number
    fairness: number
    safety: number
    transparency: number
    ethics: number
    reliability: number
}

export interface ConversationMemory {
    topics: { name: string; summary: string; messageRange: [number, number] }[]
    codeContext: { language: string; description: string; lastVersion: string }[]
    decisions: { what: string; why: string }[]
    keyFacts: string[]
    lastProcessedIndex: number
}

export interface NoteSummary {
    id: string
    title: string
    created_at: string
    updated_at: string
    pinned: boolean
    char_count: number
}

export interface Note extends NoteSummary {
    content: string
}

export interface DeploymentStatus {
    running: boolean
    pid: number | null
    uptime_seconds: number | null
}

export interface FineTuneParams {
    model_id: string
    dataset_path: string
    epochs?: number
    learning_rate?: number
    batch_size?: number
    lora_rank?: number
    lora_alpha?: number
    max_seq_length?: number
    lora_dropout?: number
    lora_layers?: number
    job_name?: string
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface ModelFormatInfo {
    model_id: string
    model_type: string
    has_chat_template: boolean
    chat_template_preview: string | null
    eos_token: string | null
    bos_token: string | null
    pad_token: string | null
}

export interface IndexerSource {
    id: string
    url: string
    label: string
    added: number
    enabled: boolean
}

export interface IndexerStatus {
    running: boolean
    last_run: number | null
    collection_id: string | null
    total_sources: number
    enabled_sources: number
}

// --- Utilities ---

/** Strip path prefixes like "Local / Models / " from model display names */
export function cleanModelName(name: string): string {
    return name.replace(/^.*\s*\/\s*(?:Models|models)\s*\/\s*/, '')
}

// --- API Client ---

export const apiClient = {
    API_BASE,
    monitor: {
        getStats: async (): Promise<SystemStats> => {
            const res = await fetch(`${API_BASE}/api/monitor/stats`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        }
    },
    preparation: {
        previewCsv: async (filePath: string, limit: number = 5): Promise<{ data: PreviewRow[] }> => {
            const res = await fetch(`${API_BASE}/api/preparation/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath, limit })
            });
            if (!res.ok) throw new Error('Failed to preview CSV');
            return res.json();
        },
        convertCsv: async (filePath: string, outputPath: string, instructionCol: string, inputCol?: string, outputCol?: string): Promise<ConvertResult> => {
            const res = await fetch(`${API_BASE}/api/preparation/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath, output_path: outputPath, instruction_col: instructionCol, input_col: inputCol, output_col: outputCol })
            });
            if (!res.ok) throw new Error('Failed to convert CSV');
            return res.json();
        },
        generateMcp: async (modelId: string, serverId: string, prompt: string, outputPath: string): Promise<{ data: PreviewRow[]; rows: number }> => {
            const res = await fetch(`${API_BASE}/api/preparation/generate-mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId, server_id: serverId, prompt, output_path: outputPath })
            });
            if (!res.ok) throw new Error('MCP generation is not yet implemented');
            return res.json();
        }
    },
    engine: {
        getModels: async (): Promise<ModelEntry[]> => {
            const res = await fetch(`${API_BASE}/api/engine/models`);
            if (!res.ok) throw new Error('Failed to fetch models');
            return res.json();
        },
        downloadModel: async (modelId: string): Promise<{ status: string; model_id: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/models/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId })
            });
            if (!res.ok) throw new Error('Failed to start download');
            return res.json();
        },
        deleteModel: async (modelId: string): Promise<{ status: string; model_id: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/models/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId })
            });
            if (!res.ok) throw new Error('Failed to delete model');
            return res.json();
        },
        registerModel: async (name: string, path: string, url: string = ""): Promise<ModelEntry> => {
            const res = await fetch(`${API_BASE}/api/engine/models/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, path, url })
            });
            if (!res.ok) throw new Error('Failed to register model');
            return res.json();
        },
        scanModels: async (path: string): Promise<ModelEntry[]> => {
            const res = await fetch(`${API_BASE}/api/engine/models/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            if (!res.ok) throw new Error('Failed to scan directory');
            return res.json();
        },
        getJobStatus: async (jobId: string): Promise<JobStatus> => {
            const res = await fetch(`${API_BASE}/api/engine/jobs/${jobId}`);
            if (!res.ok) throw new Error('Failed to get job status');
            return res.json();
        },
        finetune: async (params: FineTuneParams): Promise<{ job_id: string; status: string; job_name: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/finetune`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            if (!res.ok) throw new Error('Failed to start fine-tuning');
            return res.json();
        },
        chatStream: async (modelId: string, messages: ChatMessage[], params: Record<string, unknown> = {}): Promise<Response> => {
            const res = await fetch(`${API_BASE}/api/engine/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId, messages, ...params })
            });
            if (!res.ok) throw new Error('Failed to generate chat response');
            return res;
        },
        stopChat: async (): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/chat/stop`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to stop chat generation');
            return res.json();
        },
        listAdapters: async (): Promise<ModelEntry[]> => {
            const res = await fetch(`${API_BASE}/api/engine/models/adapters`);
            if (!res.ok) throw new Error('Failed to fetch adapters');
            return res.json();
        },
        getModelFormat: async (modelId: string): Promise<ModelFormatInfo> => {
            const res = await fetch(`${API_BASE}/api/engine/models/${encodeURIComponent(modelId)}/format`);
            if (!res.ok) throw new Error('Failed to fetch model format');
            return res.json();
        },
        exportModel: async (modelId: string, outputPath: string, qBits: number = 4): Promise<{ status: string; path: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/models/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId, output_path: outputPath, q_bits: qBits })
            });
            if (!res.ok) throw new Error('Failed to export model');
            return res.json();
        },
        loadModel: async (modelId: string): Promise<{ status: string; model_id: string; context_window?: number; architecture?: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/models/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId })
            });
            if (!res.ok) throw new Error('Failed to load model into memory');
            return res.json();
        },
        unloadModel: async (): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/engine/models/unload`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to unload model');
            return res.json();
        }
    },
    rag: {
        getCollections: async (): Promise<RagCollection[]> => {
            const res = await fetch(`${API_BASE}/api/rag/collections`);
            if (!res.ok) throw new Error('Failed to fetch collections');
            return res.json();
        },
        createCollection: async (name: string): Promise<RagCollection> => {
            const res = await fetch(`${API_BASE}/api/rag/collections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!res.ok) throw new Error('Failed to create collection');
            return res.json();
        },
        deleteCollection: async (id: string): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/rag/collections/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete collection');
            return res.json();
        },
        ingest: async (collectionId: string, files: string[], chunkSize: number, overlap: number): Promise<RagCollection> => {
            const res = await fetch(`${API_BASE}/api/rag/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection_id: collectionId, files, chunk_size: chunkSize, overlap })
            });
            if (!res.ok) throw new Error('Failed to ingest files');
            return res.json();
        },
        query: async (collectionId: string, query: string, nResults: number = 5): Promise<{ results: { text: string; score: number; index: number; method?: string }[] }> => {
            const res = await fetch(`${API_BASE}/api/rag/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection_id: collectionId, query, n_results: nResults })
            });
            if (!res.ok) throw new Error('Failed to query collection');
            return res.json();
        },
    },
    agents: {
        getAgents: async (): Promise<AgentDefinition[]> => {
            const res = await fetch(`${API_BASE}/api/agents/`);
            if (!res.ok) throw new Error('Failed to fetch agents');
            return res.json();
        },
        saveAgent: async (agent: AgentDefinition): Promise<AgentDefinition> => {
            const res = await fetch(`${API_BASE}/api/agents/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agent)
            });
            if (!res.ok) throw new Error('Failed to save agent');
            return res.json();
        },
        deleteAgent: async (agentId: string): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete agent');
            return res.json();
        },
        execute: async (agentId: string, input: string): Promise<AgentExecutionResult> => {
            const res = await fetch(`${API_BASE}/api/agents/${agentId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input })
            });
            if (!res.ok) throw new Error('Failed to execute agent');
            return res.json();
        }
    },
    conversations: {
        list: async (): Promise<ConversationSummary[]> => {
            const res = await fetch(`${API_BASE}/api/conversations/`);
            if (!res.ok) throw new Error('Failed to fetch conversations');
            return res.json();
        },
        get: async (id: string): Promise<Conversation> => {
            const res = await fetch(`${API_BASE}/api/conversations/${id}`);
            if (!res.ok) throw new Error('Failed to fetch conversation');
            return res.json();
        },
        create: async (title?: string, messages?: ConversationMessage[], modelId?: string): Promise<Conversation> => {
            const res = await fetch(`${API_BASE}/api/conversations/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, messages, model_id: modelId })
            });
            if (!res.ok) throw new Error('Failed to create conversation');
            return res.json();
        },
        update: async (id: string, updates: { title?: string; messages?: ConversationMessage[]; model_id?: string; pinned?: boolean }): Promise<Conversation> => {
            const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Failed to update conversation');
            return res.json();
        },
        delete: async (id: string): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete conversation');
            return res.json();
        },
        search: async (query: string): Promise<ConversationSummary[]> => {
            const res = await fetch(`${API_BASE}/api/conversations/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query })
            });
            if (!res.ok) throw new Error('Failed to search conversations');
            return res.json();
        },
        branch: async (id: string, messageIndex: number): Promise<Conversation> => {
            const res = await fetch(`${API_BASE}/api/conversations/${id}/branch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_index: messageIndex })
            });
            if (!res.ok) throw new Error('Failed to branch conversation');
            return res.json();
        },
    },
    sandbox: {
        check: async (code: string, language: string = ''): Promise<SyntaxCheckResult> => {
            const res = await fetch(`${API_BASE}/api/sandbox/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });
            if (!res.ok) throw new Error('Syntax check failed');
            return res.json();
        },
        run: async (code: string, language: string = '', timeout?: number): Promise<SandboxResult> => {
            const res = await fetch(`${API_BASE}/api/sandbox/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, timeout })
            });
            if (!res.ok) throw new Error('Sandbox execution failed');
            return res.json();
        },
        kill: async (runId: string): Promise<{ killed: boolean }> => {
            const res = await fetch(`${API_BASE}/api/sandbox/kill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_id: runId })
            });
            if (!res.ok) throw new Error('Failed to kill process');
            return res.json();
        },
    },
    deployment: {
        start: async (modelPath: string, host: string, port: number): Promise<{ status: string; message: string; pid: number }> => {
            const res = await fetch(`${API_BASE}/api/deployment/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_path: modelPath, host, port })
            });
            if (!res.ok) throw new Error('Failed to start deployment');
            return res.json();
        },
        stop: async (): Promise<{ status: string; message: string }> => {
            const res = await fetch(`${API_BASE}/api/deployment/stop`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to stop deployment');
            return res.json();
        },
        getStatus: async (): Promise<DeploymentStatus> => {
            const res = await fetch(`${API_BASE}/api/deployment/status`);
            if (!res.ok) throw new Error('Failed to fetch deployment status');
            return res.json();
        },
        getLogs: async (since: number = 0): Promise<{ logs: { timestamp: number; source: string; message: string }[] }> => {
            const res = await fetch(`${API_BASE}/api/deployment/logs?since=${since}`);
            if (!res.ok) throw new Error('Failed to fetch deployment logs');
            return res.json();
        }
    },
    notes: {
        list: async (): Promise<NoteSummary[]> => {
            const res = await fetch(`${API_BASE}/api/notes/`);
            if (!res.ok) throw new Error('Failed to fetch notes');
            return res.json();
        },
        get: async (id: string): Promise<Note> => {
            const res = await fetch(`${API_BASE}/api/notes/${id}`);
            if (!res.ok) throw new Error('Failed to fetch note');
            return res.json();
        },
        create: async (title?: string, content?: string): Promise<Note> => {
            const res = await fetch(`${API_BASE}/api/notes/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content })
            });
            if (!res.ok) throw new Error('Failed to create note');
            return res.json();
        },
        update: async (id: string, updates: { title?: string; content?: string; pinned?: boolean }): Promise<Note> => {
            const res = await fetch(`${API_BASE}/api/notes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error('Failed to update note');
            return res.json();
        },
        delete: async (id: string): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/notes/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete note');
            return res.json();
        },
    },
    mcp: {
        listServers: async (): Promise<{ id: string; name: string; command: string; args: string[]; env: Record<string, string>; transport: string }[]> => {
            const res = await fetch(`${API_BASE}/api/mcp/servers`);
            if (!res.ok) throw new Error('Failed to fetch MCP servers');
            return res.json();
        },
        addServer: async (server: { name: string; command: string; args?: string[]; env?: Record<string, string>; transport?: string }): Promise<{ id: string; name: string; command: string }> => {
            const res = await fetch(`${API_BASE}/api/mcp/servers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(server)
            });
            if (!res.ok) throw new Error('Failed to add MCP server');
            return res.json();
        },
        removeServer: async (serverId: string): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/mcp/servers/${serverId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to remove MCP server');
            return res.json();
        },
        listTools: async (serverId: string): Promise<{ tools: { name: string; description: string; inputSchema: Record<string, unknown> }[] }> => {
            const res = await fetch(`${API_BASE}/api/mcp/servers/${serverId}/tools`);
            if (!res.ok) throw new Error('Failed to list MCP tools');
            return res.json();
        },
        executeTool: async (serverId: string, toolName: string, toolArgs: Record<string, unknown> = {}): Promise<{ result: string }> => {
            const res = await fetch(`${API_BASE}/api/mcp/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_id: serverId, tool_name: toolName, tool_args: toolArgs })
            });
            if (!res.ok) throw new Error('Failed to execute MCP tool');
            return res.json();
        },
    },
    search: {
        web: async (query: string, maxResults: number = 3, extractContent: boolean = true): Promise<{ title: string; snippet: string; url: string; content: string | null }[]> => {
            const res = await fetch(`${API_BASE}/api/search/web`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, max_results: maxResults, extract_content: extractContent })
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.results;
        },
        deep: async (query: string, maxPages: number = 5): Promise<{ results: { title: string; snippet: string; url: string; content: string | null }[]; queries_used: string[]; pages_fetched: number }> => {
            const res = await fetch(`${API_BASE}/api/search/deep`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, max_pages: maxPages })
            });
            if (!res.ok) return { results: [], queries_used: [], pages_fetched: 0 };
            return res.json();
        },
    },
    indexer: {
        getSources: async (): Promise<{ sources: IndexerSource[] }> => {
            const res = await fetch(`${API_BASE}/api/indexer/sources`);
            if (!res.ok) throw new Error('Failed to fetch indexer sources');
            return res.json();
        },
        addSource: async (url: string, label?: string): Promise<IndexerSource> => {
            const res = await fetch(`${API_BASE}/api/indexer/sources`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, label })
            });
            if (!res.ok) throw new Error('Failed to add indexer source');
            return res.json();
        },
        removeSource: async (sourceId: string): Promise<{ ok: boolean }> => {
            const res = await fetch(`${API_BASE}/api/indexer/sources/${sourceId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to remove indexer source');
            return res.json();
        },
        toggleSource: async (sourceId: string, enabled: boolean): Promise<{ ok: boolean }> => {
            const res = await fetch(`${API_BASE}/api/indexer/sources/${sourceId}/toggle`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            if (!res.ok) throw new Error('Failed to toggle indexer source');
            return res.json();
        },
        crawl: async (): Promise<{ status: string; indexed: number; fetched?: number }> => {
            const res = await fetch(`${API_BASE}/api/indexer/crawl`, { method: 'POST' });
            if (!res.ok) throw new Error('Crawl failed');
            return res.json();
        },
        getStatus: async (): Promise<IndexerStatus> => {
            const res = await fetch(`${API_BASE}/api/indexer/status`);
            if (!res.ok) throw new Error('Failed to fetch indexer status');
            return res.json();
        },
        start: async (intervalMinutes?: number): Promise<{ status: string }> => {
            const url = intervalMinutes
                ? `${API_BASE}/api/indexer/start?interval_minutes=${intervalMinutes}`
                : `${API_BASE}/api/indexer/start`;
            const res = await fetch(url, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to start indexer');
            return res.json();
        },
        stop: async (): Promise<{ status: string }> => {
            const res = await fetch(`${API_BASE}/api/indexer/stop`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to stop indexer');
            return res.json();
        },
    },
    terminal: {
        runUrl: (prompt: string, modelId: string, opts?: { maxIterations?: number; temperature?: number }) => {
            return {
                url: `${API_BASE}/api/terminal/run`,
                body: { prompt, model_id: modelId, max_iterations: opts?.maxIterations ?? 10, temperature: opts?.temperature ?? 0.7 },
            }
        },
        decideDiff: async (sessionId: string, callId: string, approved: boolean, reason: string = ''): Promise<void> => {
            const res = await fetch(`${API_BASE}/api/terminal/diff/decide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, call_id: callId, approved, reason })
            });
            if (!res.ok) throw new Error('Failed to decide diff');
        },
        stop: async (sessionId: string): Promise<void> => {
            const res = await fetch(`${API_BASE}/api/terminal/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (!res.ok) throw new Error('Failed to stop terminal session');
        },
    },
    checkHealth: async (): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/health`);
            return res.ok;
        } catch {
            return false;
        }
    }
}
