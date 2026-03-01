# Models

Source: `src/renderer/src/components/ModelsInterface.tsx`

## Overview

Browse, download, and manage LLM models. Models are stored locally in `~/.silicon-studio/models/`.

## Model Sources

The Models page lists models from multiple sources:

1. **Hugging Face** — Browse and download MLX-compatible models. Filtered to `mlx-community` and similar repos.
2. **LM Studio** — Auto-discovers models in `~/.cache/lm-studio/models/`.
3. **Ollama** — Auto-discovers models in `~/.ollama/models/`.
4. **Custom** — Register any local model by path.

## Model Registry

All known models are tracked in `~/.silicon-studio/models.json`. Each entry contains:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (Hugging Face repo ID or generated UUID) |
| `name` | Display name |
| `size` | Parameter count (e.g., "1.7B", "7B") |
| `architecture` | Model architecture (qwen2, llama, mistral, etc.) |
| `downloaded` | Whether files exist locally |
| `local_path` | Absolute path to model directory |
| `is_finetuned` | Whether this is a fine-tuned adapter |
| `url` | Hugging Face URL (if applicable) |

## Operations

### Download

Click the download button on any Hugging Face model. Downloads run in the background. Progress is not currently tracked in the UI — the model appears as "downloaded" when complete.

### Delete

Removes the model files from disk and marks it as not downloaded in the registry.

### Register Custom Model

Provide a name, local path, and optional Hugging Face URL. The model is added to the registry immediately.

### Scan Directory

Point to a directory containing model folders. All valid MLX models found are registered automatically.

## Loading and Unloading

Only one model can be loaded in memory at a time. Load a model by:

- Clicking "Load" on the Models page
- Using the model dropdown in the top bar

The top bar shows the currently loaded model name with an Eject button. Loading a new model automatically unloads the previous one.

Backend implementation: `backend/app/engine/service.py` — calls `mlx_lm.load()` to load the model and tokenizer into MLX memory.

## Model Card

Clicking a model opens a split-view detail panel showing:

- Model metadata (size, architecture, path)
- Actions (download, delete, load)
- Status indicators
