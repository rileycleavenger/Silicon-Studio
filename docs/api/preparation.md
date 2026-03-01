# Data Preparation API

Prefix: `/api/preparation`

Source: `backend/app/api/preparation.py`

## Preview CSV

```
POST /api/preparation/preview
```

```json
{
  "file_path": "/absolute/path/to/file.csv",
  "limit": 5
}
```

Returns first N rows as array of objects.

## Convert CSV to JSONL

```
POST /api/preparation/convert
```

```json
{
  "file_path": "/path/to/input.csv",
  "output_path": "/path/to/output.jsonl",
  "instruction_col": "question",
  "input_col": "context",
  "output_col": "answer"
}
```

`input_col` is optional. Maps CSV columns to `instruction`/`input`/`output` fields.

Returns:

```json
{
  "rows_converted": 150,
  "rows_skipped": 3,
  "output_path": "/path/to/output.jsonl"
}
```

## Generate MCP Dataset

```
POST /api/preparation/generate-mcp
```

```json
{
  "model_id": "model-uuid",
  "server_id": "mcp-server-uuid",
  "prompt": "You are a helpful assistant that uses tools.",
  "output_path": "/path/to/output.jsonl"
}
```

Connects to the specified MCP server, discovers tools, and generates training examples. Each tool produces two entries:

1. Tool call example (instruction + tool call JSON as output)
2. Capability description (what the tool does + parameter schema)

Returns:

```json
{
  "data": [...],
  "rows": 12
}
```
