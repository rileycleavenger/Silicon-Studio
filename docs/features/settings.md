# Settings

Source: `src/renderer/src/components/Settings.tsx`

## Overview

Centralized configuration page accessible from the bottom of the left sidebar. Changes are persisted to `localStorage` immediately.

## Sections

### General

| Setting | Description |
|---------|-------------|
| Backend URL | Read-only display (`http://127.0.0.1:8000`) |
| Reasoning Mode | Default reasoning mode for new conversations (Off / Auto / Low / High) |

### Chat Defaults

Default values for new conversations. See [Configuration](/guide/configuration) for the full field list.

- System Prompt
- Temperature (slider 0-2)
- Max Tokens (slider 64-8192)
- Max Context (slider 512-32768)
- Top-P (slider 0-1)
- Repetition Penalty (slider 1-2)
- Web Search toggle

### RAG Defaults

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Chunk Size | 128-2048 | 512 | Characters per chunk during ingestion |
| Chunk Overlap | 0-512 | 50 | Overlap between chunks |

### Status Bar Thresholds

Configure when RAM/CPU usage bars change color in the top status bar.

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Warning % | 20-95 | 60 | Threshold for yellow (warning) color |
| Critical % | 30-99 | 85 | Threshold for red (critical) color |

### MCP Servers

Full CRUD for MCP server configurations. See [MCP Integration](/features/mcp).

- List all configured servers with command details
- Add new server (name, command, args)
- Test connection (discovers tools and reports count)
- Remove server

### About / Reset

- App name and description
- "Reset All Settings" button — clears all localStorage keys and restores defaults (requires confirmation)
