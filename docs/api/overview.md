# API Overview

The backend exposes a REST API on `http://127.0.0.1:8000`. All endpoints accept and return JSON unless noted otherwise.

## Base URL

```
http://127.0.0.1:8000
```

## Health Check

```
GET /health
```

Returns `{"status": "ok"}` when the backend is running. The frontend polls this on startup.

## Router Map

| Prefix | Module | Description |
|--------|--------|-------------|
| `/api/monitor` | [Monitor](/api/monitor) | System stats (RAM, CPU, disk) |
| `/api/engine` | [Engine](/api/engine) | Models, fine-tuning, chat, export |
| `/api/rag` | [RAG](/api/rag) | Knowledge base collections and queries |
| `/api/conversations` | [Conversations](/api/conversations) | Chat history CRUD |
| `/api/notes` | [Notes](/api/notes) | Note storage |
| `/api/agents` | [Agents](/api/agents) | Workflow definitions and execution |
| `/api/preparation` | [Preparation](/api/preparation) | Data conversion and generation |
| `/api/mcp` | [MCP](/api/mcp) | MCP server management and tool execution |
| `/api/deployment` | [Deployment](/api/deployment) | Model server lifecycle |
| `/api/sandbox` | [Sandbox](/api/sandbox) | Code execution |
| `/api/search` | [Search](/api/search) | Web search |

## CORS

The backend allows requests from:
- `http://localhost:5173` (Vite dev server)
- `http://127.0.0.1:5173`
- `app://.` (Electron)

## Error Format

All errors return:

```json
{
  "detail": "Error message here"
}
```

With appropriate HTTP status codes (400, 404, 500).

## Streaming

The chat endpoint (`POST /api/engine/chat`) returns Server-Sent Events (SSE). Each event is a JSON object:

```
data: {"token": "Hello", "done": false}
data: {"token": " world", "done": false}
data: {"token": "", "done": true, "stats": {"tokens_per_second": 42.5, ...}}
```

## Frontend Client

The API client is in `src/renderer/src/api/client.ts`. It wraps all endpoints in a namespaced object:

```typescript
apiClient.engine.getModels()
apiClient.rag.query(collectionId, query)
apiClient.mcp.listTools(serverId)
// etc.
```
