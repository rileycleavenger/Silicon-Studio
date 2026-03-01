# Deployment API

Prefix: `/api/deployment`

Source: `backend/app/api/deployment.py`

## Start Server

```
POST /api/deployment/start
```

```json
{
  "model_path": "/path/to/model",
  "host": "127.0.0.1",
  "port": 8080
}
```

Starts `mlx_lm.server` as a subprocess. Returns PID and status.

## Stop Server

```
POST /api/deployment/stop
```

Kills the running server process.

## Get Status

```
GET /api/deployment/status
```

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

## Get Logs

```
GET /api/deployment/logs?since=1709000000
```

Returns server output lines since the given Unix timestamp. Buffer capped at 500 entries.

```json
{
  "logs": [
    { "timestamp": 1709000001, "line": "Server started on 127.0.0.1:8080" }
  ]
}
```
