# SiliconDev

<div align="center">

**Local AI Development Environment for Apple Silicon**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Platform: macOS](https://img.shields.io/badge/Platform-macOS_(Apple_Silicon)-black)
![Engine: MLX](https://img.shields.io/badge/Engine-MLX-blue)

[Download DMG](https://github.com/fabriziosalmi/silicondev/releases/latest) · [Documentation](https://fabriziosalmi.github.io/silicondev/) · [Report Bug](https://github.com/fabriziosalmi/silicondev/issues)

</div>

---

**SiliconDev** is an open-source desktop app for local LLM fine-tuning, inference, and tooling on Apple Silicon. Built on [MLX](https://github.com/ml-explore/mlx), it provides a unified interface for data preparation, model management, fine-tuning, chat, RAG, MCP integration, and more. Everything runs on-device — no cloud, no API keys, no data leaves your machine.

Based on [Silicon-Studio](https://github.com/rileycleavenger/Silicon-Studio) by [Riley Cleavenger](https://github.com/rileycleavenger).

## Features

### Native Apple Silicon
MLX-powered fine-tuning (LoRA/QLoRA) and inference on M1/M2/M3/M4 chips.

### Data Preparation
- Preview and edit JSONL/CSV datasets
- PII redaction via local NLP (Presidio)
- Format conversion (CSV to JSONL, chat templates)
- MCP-based dataset generation from tool call traces

### Model Management
- Browse and download models from Hugging Face
- 4-bit / 8-bit quantization support
- Model load/switch from top bar or Models page
- Export fine-tuned models (4-bit, 8-bit, full precision)

### Fine-Tuning Engine
- LoRA / QLoRA with visual configuration
- Real-time loss curves and metrics
- Configurable hyperparameters and LoRA settings

### Chat
- Local ChatGPT-like interface, fully offline
- Conversation branching and history
- In-chat search (Ctrl+F) with match navigation
- Quick actions: rewrite, translate, self-critique, perspectives
- RAG knowledge injection and web search
- Syntax validation and auto-fix for code
- PII redaction, memory map, reasoning modes
- Collapsible parameters sidebar

### RAG Knowledge
- Create and manage document collections
- Chunk-based retrieval with keyword scoring
- Toggle per-conversation RAG context injection

### MCP Integration
- Add/remove MCP servers (stdio transport)
- Discover and test tools
- Generate fine-tuning datasets from MCP tool schemas

### Notes
- Markdown editor with live preview
- Multi-note management with pin/rename
- Send note content to chat

### Agent Workflows
- Visual workflow builder (nodes and edges)
- Agent CRUD with configurable node types

### Settings
- Centralized settings page (chat defaults, RAG defaults, MCP servers, status bar thresholds)
- Per-conversation parameter overrides
- Color-coded RAM/CPU usage bars in top status bar

## Getting Started

### Prerequisites
- macOS 13+ (Ventura or later)
- Apple Silicon Mac (M1/M2/M3/M4)
- Node.js 18+
- Python 3.10+

### Build from Source

```bash
git clone https://github.com/fabriziosalmi/silicondev.git
cd silicondev

# Frontend
npm install

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cd ..

# Run
npm run dev
```

## Tech Stack

- **Frontend**: Electron, React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Python, FastAPI, Uvicorn
- **AI Engine**: Apple MLX, MLX-LM
- **Data**: Pandas, Presidio, MCP SDK

## License

MIT License. See [LICENSE](LICENSE) for details.

## Attribution

Based on [Silicon-Studio](https://github.com/rileycleavenger/Silicon-Studio) by [Riley Cleavenger](https://github.com/rileycleavenger).
