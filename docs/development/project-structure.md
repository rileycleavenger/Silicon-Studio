# Project Structure

```
silicondev/
  package.json              # Root: Electron scripts, build config
  src/
    main/
      main.ts               # Electron main process, window creation, backend spawn
      tsconfig.json          # TypeScript config for main process
    renderer/
      package.json           # React app dependencies
      vite.config.ts         # Vite build configuration
      tailwind.config.js     # TailwindCSS theme
      src/
        App.tsx              # Root component, sidebar, tab routing
        main.tsx             # React entry point
        index.css            # Global styles, Tailwind imports
        api/
          client.ts          # API client (all backend communication)
        context/
          GlobalState.tsx    # Backend status, active model, system stats
          ConversationContext.tsx  # Conversation list and selection
          NotesContext.tsx    # Note list and selection
        components/
          TopBar.tsx         # Header: model switcher, system stats
          ChatInterface.tsx  # Chat UI, parameters sidebar
          ModelsInterface.tsx     # Model browser and management
          EngineInterface.tsx     # Fine-tuning configuration and monitoring
          DataPreparation.tsx     # CSV/JSONL conversion, MCP generation
          RagKnowledge.tsx        # Knowledge base management
          AgentWorkflows.tsx      # Workflow builder
          Deployment.tsx          # Model server deployment
          Evaluations.tsx         # Benchmark runner
          Workspace.tsx           # Markdown note editor
          Settings.tsx            # Centralized settings page
          ModelExport.tsx         # Adapter export with quantization
          ConversationListPanel.tsx  # Sidebar conversation list
          NoteListPanel.tsx          # Sidebar note list
          ui/
            Card.tsx         # Reusable card container
            PageHeader.tsx   # Page header layout
  backend/
    main.py                  # FastAPI app, router registration, CORS
    pyproject.toml           # Python dependencies
    app/
      api/
        engine.py            # Models, fine-tuning, chat, export endpoints
        rag.py               # RAG collection and query endpoints
        conversations.py     # Conversation CRUD endpoints
        notes.py             # Note CRUD endpoints
        agents.py            # Agent workflow endpoints
        preparation.py       # Data conversion endpoints
        mcp.py               # MCP server and tool endpoints
        deployment.py        # Model server endpoints
        sandbox.py           # Code execution endpoints
        search.py            # Web search endpoint
        monitor.py           # System stats endpoint
      engine/
        service.py           # MLX model loading, inference, fine-tuning
      rag/
        service.py           # Collection CRUD, ingestion, querying
      conversations/
        service.py           # Conversation storage and retrieval
      notes/
        service.py           # Note storage and retrieval
      agents/
        service.py           # Workflow storage and execution (mocked)
      preparation/
        service.py           # CSV processing
      mcp/
        __init__.py
        registry.py          # MCP server config persistence
        client.py            # MCP SDK wrapper
        service.py           # MCP orchestrator
      sandbox/
        service.py           # Code execution with subprocess
      shield/
        service.py           # PII detection (Presidio)
      monitor/
        system.py            # System resource monitoring (psutil)
    tests/                   # pytest test files
    spec/
      silicon_server.spec    # PyInstaller build spec
  resources/
    icon.icns                # macOS app icon
    icon.png                 # Source icon
    icon.iconset/            # Icon set for icns generation
    entitlements.mac.plist   # macOS entitlements
  assets/
    screenshot-*.png         # App screenshots
  docs/                      # This documentation (VitePress)
  .github/
    workflows/
      ci.yml                 # CI pipeline
```
