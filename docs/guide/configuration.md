# Configuration

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port |

The backend binds to `127.0.0.1` only. No external network access.

## Frontend Settings

Settings are stored in the browser's `localStorage` and persist across sessions.

### Chat Settings

Key: `silicon-studio-chat-settings`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `systemPrompt` | string | `"You are a helpful AI assistant running locally on Apple Silicon."` | System message prepended to every conversation |
| `temperature` | number | `0.7` | Sampling temperature (0 = deterministic, 2 = max randomness) |
| `maxTokens` | number | `2048` | Maximum tokens per response |
| `maxContext` | number | `4096` | Conversation context window size |
| `topP` | number | `0.9` | Nucleus sampling threshold |
| `repetitionPenalty` | number | `1.1` | Penalty for repeated tokens |
| `reasoningMode` | string | `"auto"` | One of: `off`, `auto`, `low`, `high` |
| `webSearchEnabled` | boolean | `false` | Inject web search results into context |

These values can be changed in the **Settings** page or per-conversation via the collapsible parameters sidebar.

### RAG Settings

Key: `silicon-studio-rag-settings`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `chunkSize` | number | `512` | Characters per chunk during ingestion |
| `chunkOverlap` | number | `50` | Overlap between consecutive chunks |

### Per-Conversation Overrides

The parameters sidebar in the Chat view stores overrides in component state. These are not persisted to localStorage — they reset when switching conversations. The sidebar also controls:

| Setting | Description |
|---------|-------------|
| Show Prompt | Display the raw system prompt sent to the model |
| Syntax Check | Auto-validate code blocks in responses |
| Auto-fix Syntax | Show a "Fix" button on invalid code |
| Memory Map | Auto-summarize context every N messages |
| PII Redaction | Replace emails, phones, IPs with tokens before sending |
| RAG Knowledge | Enable and select a knowledge collection |
| Web Search | Enable DuckDuckGo search injection |
| Visible Actions | Toggle which quick actions appear on responses |

## Backend Storage

All backend data lives in `~/.silicon-studio/`. There is no database — everything is JSON files on disk.

### models.json

```json
{
  "model-id": {
    "id": "model-id",
    "name": "Qwen3-1.7B-MLX-8bit",
    "size": "1.7B",
    "architecture": "qwen2",
    "downloaded": true,
    "local_path": "/Users/you/.silicon-studio/models/...",
    "is_finetuned": false
  }
}
```

### mcp_servers.json

```json
{
  "server-uuid": {
    "id": "server-uuid",
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": {},
    "transport": "stdio"
  }
}
```

## Electron Configuration

Build config is in the root `package.json` under the `"build"` key. Key settings:

| Field | Value |
|-------|-------|
| `appId` | `com.siliconstudio.app` |
| `mac.target` | `["dmg", "zip"]` |
| `mac.hardenedRuntime` | `true` |
| `mac.icon` | `resources/icon.icns` |

The backend is bundled as a PyInstaller binary in `backend/dist/silicon_server` and included via `extraResources`.
