# Data Preparation

Source: `src/renderer/src/components/DataPreparation.tsx`

## Overview

Tools for converting raw data into fine-tuning datasets. Three modes: CSV to JSONL conversion, file preview, and MCP-based generation.

## CSV Preview

Upload a CSV file and preview its contents. Configurable row limit (1-1000). Displays column headers and data in a table.

API: `POST /api/preparation/preview`

## CSV to JSONL Conversion

Map CSV columns to the standard fine-tuning format:

| Target Field | Required | Description |
|-------------|----------|-------------|
| `instruction` | Yes | The instruction or question |
| `input` | No | Additional context or input |
| `output` | Yes | The expected response |

Select source columns from the CSV headers. The converter produces a JSONL file where each line is:

```json
{"instruction": "...", "input": "...", "output": "..."}
```

Invalid rows (missing required fields) are skipped. The result shows the number of converted vs skipped rows.

API: `POST /api/preparation/convert`

## MCP Dataset Generation

Generate fine-tuning datasets from MCP tool schemas. This connects to a configured MCP server, discovers its tools, and creates training examples that teach a model how to use those tools.

For each tool discovered, two training entries are generated:

1. **Tool call example**: instruction describes a use case, output is a JSON tool call with name and parameters.
2. **Capability description**: instruction asks what the tool does, output describes the tool and its parameter schema.

Requires:
- A configured MCP server (see [MCP Integration](/features/mcp))
- A loaded model (model ID is sent but not currently used for generation)
- An output path for the JSONL file

API: `POST /api/preparation/generate-mcp`

## Backend

Implementation: `backend/app/preparation/service.py`

- `preview_csv()` — reads CSV with pandas, returns rows as dicts
- `convert_csv_to_jsonl()` — maps columns, validates rows, writes JSONL
- MCP generation is in `backend/app/api/preparation.py` (endpoint logic)
