---
layout: home
hero:
  name: SiliconDev
  text: Local AI for Apple Silicon
  tagline: Fine-tune, chat, and deploy LLMs entirely on your Mac. No cloud, no API keys, no data leaving your machine.
  image:
    src: /logo.png
    alt: SiliconDev
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/overview
    - theme: alt
      text: GitHub
      link: https://github.com/fabriziosalmi/silicondev

features:
  - title: MLX-Powered Inference
    details: Runs on Apple's MLX framework. LoRA and QLoRA fine-tuning directly on M1/M2/M3/M4 unified memory.
  - title: Full Offline Chat
    details: ChatGPT-like interface that works without internet. Conversation branching, search, quick actions, syntax checking.
  - title: RAG and Web Search
    details: Ingest documents into knowledge collections. Query them during chat. Optional web search via DuckDuckGo.
  - title: MCP Integration
    details: Connect to Model Context Protocol servers. Discover tools, execute them, generate fine-tuning datasets from tool schemas.
  - title: Data Preparation
    details: Preview CSV/JSONL, map columns, convert formats, strip PII. MCP-based synthetic data generation.
  - title: Model Management
    details: Download from Hugging Face, auto-discover from LM Studio and Ollama. Load/unload from top bar. Export with quantization.
---

## Attribution

SiliconDev is based on [Silicon-Studio](https://github.com/rileycleavenger/Silicon-Studio) by Riley Cleavenger. Licensed under MIT.
