# Architecture

## Overview

SiliconDev is a desktop application with two processes:

```
Electron Main Process
    |
    +-- Renderer (React app, Vite, TailwindCSS)
    |       |
    |       +-- HTTP requests to localhost:8000
    |
    +-- Backend (FastAPI, spawned as subprocess)
            |
            +-- MLX engine (model loading, inference, fine-tuning)
            +-- Services (RAG, agents, conversations, notes, MCP, sandbox)
            +-- File storage (~/.silicon-studio/)
```

The frontend communicates with the backend exclusively via REST API over `localhost:8000`. There is no IPC bridge for data — Electron IPC is only used for native OS features (file dialogs, window controls).

## Frontend

| Layer | Technology | Location |
|-------|-----------|----------|
| Shell | Electron 29 | `src/main/main.ts` |
| UI | React 19, TypeScript | `src/renderer/src/` |
| Build | Vite | `src/renderer/vite.config.ts` |
| Styling | TailwindCSS | `src/renderer/src/index.css` |
| State | React Context | `src/renderer/src/context/` |
| API Client | Fetch wrapper | `src/renderer/src/api/client.ts` |

### State Management

Three context providers wrap the app:

- **GlobalStateProvider** — backend status, system stats, active model, training state. Polls every 5 seconds.
- **ConversationProvider** — conversation list, active selection, search, CRUD operations.
- **NotesProvider** — note list, active selection, CRUD operations.

### Component Layout

```
App.tsx
  +-- TopBar (model switcher, system stats)
  +-- Left Sidebar (navigation, conversation/note lists)
  +-- Content Area (renders active tab component)
  +-- Right Sidebar (chat parameters, collapsed by default)
```

The left sidebar is always visible. The right sidebar (parameters) only appears on the Chat tab and is collapsed by default.

## Backend

| Layer | Technology | Location |
|-------|-----------|----------|
| Server | FastAPI, Uvicorn | `backend/main.py` |
| ML Engine | MLX, MLX-LM | `backend/app/engine/` |
| Data | Pandas, JSON files | `backend/app/preparation/` |
| Privacy | Presidio | `backend/app/shield/` |
| MCP | MCP Python SDK | `backend/app/mcp/` |
| Sandbox | subprocess | `backend/app/sandbox/` |

### API Router Registration

All routers are registered in `backend/main.py`:

| Prefix | Router | Purpose |
|--------|--------|---------|
| `/api/monitor` | `monitor.py` | System stats |
| `/api/preparation` | `preparation.py` | CSV/JSONL conversion |
| `/api/engine` | `engine.py` | Models, fine-tuning, chat |
| `/api/deployment` | `deployment.py` | Model server |
| `/api/rag` | `rag.py` | Knowledge base |
| `/api/agents` | `agents.py` | Workflow execution |
| `/api/conversations` | `conversations.py` | Chat history |
| `/api/sandbox` | `sandbox.py` | Code execution |
| `/api/notes` | `notes.py` | Note storage |
| `/api/search` | `search.py` | Web search |
| `/api/mcp` | `mcp.py` | MCP servers and tools |

### Model Lifecycle

```
Download (HuggingFace) -> Register in models.json -> Load into MLX memory -> Chat/Fine-tune -> Unload
```

Only one model can be loaded at a time. Loading a new model unloads the previous one. The active model state is tracked in the frontend's `GlobalState` context.

### Data Flow: Chat

```
User types message
  -> Frontend sends POST /api/engine/chat (SSE stream)
  -> Backend checks RAG (if enabled): queries collection, injects top chunks
  -> Backend checks Web Search (if enabled): fetches results, injects snippets
  -> Backend builds message array with system prompt + context + history
  -> MLX generates tokens, streamed back via SSE
  -> Frontend renders tokens incrementally
  -> On complete: syntax check (if enabled), save to conversation
```

### Data Flow: Fine-Tuning

```
User configures job (model, dataset, hyperparameters)
  -> POST /api/engine/finetune starts background thread
  -> Backend runs mlx_lm.lora() with config
  -> Frontend polls GET /api/engine/jobs/{id} every 2 seconds
  -> Loss/metrics streamed back in job status
  -> On complete: adapter saved to ~/.silicon-studio/adapters/
```
