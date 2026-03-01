# Development Setup

## Prerequisites

- macOS 13+ on Apple Silicon
- Node.js 18+
- Python 3.10+
- Git

## Clone and Install

```bash
git clone https://github.com/fabriziosalmi/silicondev.git
cd silicondev

# Frontend
npm install

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd ..
```

## Run Development Mode

```bash
npm run dev
```

This runs concurrently:
1. `dev:renderer` — Vite dev server on port 5173
2. `dev:electron` — waits for Vite, compiles TypeScript, launches Electron

The backend is started as a subprocess by the Electron main process. It binds to `127.0.0.1:8000`.

## Build

```bash
npm run build
```

Compiles:
1. Renderer: TypeScript check + Vite production build to `dist/renderer/`
2. Main: TypeScript compilation to `dist/main/`

## Package for Distribution

```bash
npm run package
```

1. Builds frontend and main process
2. Builds backend via PyInstaller (`backend/spec/silicon_server.spec`)
3. Packages everything with electron-builder into `release/`

Output: `.dmg` and `.zip` in `release/`.

## Backend Development

Run the backend standalone:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

## Tests

```bash
cd backend
pytest
```

Uses `pytest-asyncio` for async endpoint tests. Test files are in `backend/tests/`.

## Linting

```bash
cd backend
black app/ tests/
isort app/ tests/
```

Frontend uses TypeScript strict mode. The build fails on type errors.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/main/` | Electron main process |
| `src/renderer/src/` | React application |
| `src/renderer/src/components/` | UI components |
| `src/renderer/src/api/client.ts` | API client |
| `src/renderer/src/context/` | React context providers |
| `backend/app/` | FastAPI application |
| `backend/app/api/` | API route handlers |
| `backend/app/engine/` | MLX engine service |
| `backend/app/rag/` | RAG service |
| `backend/app/mcp/` | MCP integration |
| `backend/tests/` | Backend tests |
| `resources/` | App icon, entitlements |
| `assets/` | Screenshots |
