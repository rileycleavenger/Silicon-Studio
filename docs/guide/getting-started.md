# Getting Started

## Requirements

- macOS 13 (Ventura) or later
- Apple Silicon Mac (M1, M2, M3, or M4)
- Node.js 18+
- Python 3.10+

## Install from Source

```bash
git clone https://github.com/fabriziosalmi/Silicon-Studio.git
cd Silicon-Studio

# Frontend dependencies
npm install

# Backend dependencies
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd ..
```

## Run in Development Mode

```bash
npm run dev
```

This starts both the Vite dev server (port 5173) and the Electron shell. The backend FastAPI server starts automatically on port 8000.

## Build for Distribution

```bash
npm run package
```

Produces a `.dmg` and `.zip` in the `release/` directory. The backend is bundled via PyInstaller.

## First Steps

1. Open the app. Wait for the backend health check (green dot in the top bar).
2. Go to **Models** and download a model from Hugging Face (e.g., `mlx-community/Qwen3-1.7B-MLX-8bit`).
3. Click the model name in the top bar to load it into memory.
4. Switch to **Chat** and start a conversation.

## Storage

All user data is stored in `~/.silicon-studio/`:

| Directory | Contents |
|-----------|----------|
| `models.json` | Model registry (names, paths, status) |
| `models/` | Downloaded model files |
| `adapters/` | Fine-tuned LoRA adapters |
| `conversations/` | Chat history as JSON files |
| `notes/` | Markdown notes as JSON files |
| `agents/agents.json` | Agent workflow definitions |
| `rag/` | RAG collections and chunks |
| `mcp_servers.json` | MCP server configurations |

No data is sent to external servers. Everything stays on disk.
