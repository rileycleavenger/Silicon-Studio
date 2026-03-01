# Changelog

## v0.1.0

Initial release. Based on [Silicon-Studio](https://github.com/rileycleavenger/Silicon-Studio) by Riley Cleavenger with significant additions.

### Core

- Electron + React + TypeScript frontend with TailwindCSS dark theme
- FastAPI + MLX backend for Apple Silicon
- All data stored locally in `~/.silicon-studio/`

### Models

- Browse and download models from Hugging Face
- Auto-discover models from LM Studio, Ollama, HuggingFace cache
- Register custom models by local path
- Load/unload from top bar dropdown
- Delete downloaded models

### Chat

- Streaming inference with SSE
- Conversation persistence with CRUD
- Conversation branching (fork at any message)
- Conversation search (sidebar)
- In-chat text search with match navigation (Ctrl+F)
- Collapsible parameters sidebar (collapsed by default)
- Quick actions: rewrite, translate, perspectives, self-critique, ethical assessment
- Code syntax checking and sandbox execution
- PII redaction via Presidio
- Memory map (auto-summarize context)
- RAG knowledge injection
- Web search injection (DuckDuckGo)
- Reasoning mode control (off, auto, low, high)

### Fine-Tuning

- LoRA and QLoRA via MLX
- Preset configurations (draft, balanced, deep)
- Configurable hyperparameters and LoRA settings
- Real-time loss curves and job monitoring

### Data Preparation

- CSV preview and JSONL conversion
- Column mapping for instruction/input/output
- MCP-based synthetic dataset generation

### RAG Knowledge

- Collection CRUD
- File ingestion with chunking
- Keyword-overlap querying (no vector embeddings yet)
- Chat integration toggle

### MCP Integration

- Server management (add, remove, test)
- Tool discovery via MCP protocol
- Tool execution
- Dataset generation from tool schemas

### Agent Workflows

- Workflow CRUD with nodes and edges
- Node types: input, llm, tool, condition, output
- Execution is mocked (placeholder results)

### Notes

- Markdown editor with auto-save
- Pin, rename, delete
- Export as .md
- Send to chat

### Model Export

- Export fine-tuned adapters with quantization
- 4-bit, 8-bit, or full precision
- Uses mlx_lm.fuse()

### Deployment

- Deploy model as OpenAI-compatible HTTP server
- Start/stop with real-time logs

### Evaluations

- Benchmark runner (MMLU, HellaSwag, HumanEval, TruthfulQA)
- Score tracking and history

### Settings

- Centralized settings page
- Chat defaults, RAG defaults, MCP server management
- Reset all settings

### UI

- Dark theme throughout
- Collapsible left sidebar with conversation/note panels
- Collapsible right sidebar (parameters)
- Top bar with model switcher and system stats
- Search within conversations
