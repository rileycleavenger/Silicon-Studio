# Deployment

Source: `src/renderer/src/components/Deployment.tsx`

## Overview

Deploy a loaded model as a local HTTP inference server. Uses `mlx_lm.server` to expose an OpenAI-compatible API.

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| Host | `127.0.0.1` | Bind address |
| Port | `8080` | Server port |
| Model | (active model) | Model path |

## Operations

### Start

`POST /api/deployment/start` launches `mlx_lm.server` as a subprocess with the specified model, host, and port.

### Stop

`POST /api/deployment/stop` kills the server process.

### Status

`GET /api/deployment/status` returns:

```json
{
  "running": true,
  "pid": 12345,
  "model_path": "/path/to/model",
  "host": "127.0.0.1",
  "port": 8080,
  "uptime": 3600
}
```

### Logs

`GET /api/deployment/logs?since=timestamp` returns server stdout/stderr since the given timestamp. The frontend polls this endpoint to display a real-time log stream. Log buffer is capped at 500 entries.

## Deployed API

The deployed server exposes an OpenAI-compatible chat completion endpoint:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "local", "messages": [{"role": "user", "content": "Hello"}]}'
```

This allows integration with any tool that supports the OpenAI API format (Continue, Cursor, Open WebUI, etc.).

## Backend

Implementation: `backend/app/api/deployment.py` and service logic inline. The subprocess is tracked by PID and killed on stop.
