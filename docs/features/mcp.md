# MCP Integration

Source: `backend/app/mcp/`, `src/renderer/src/components/Settings.tsx`

## Overview

Model Context Protocol (MCP) support. Connect to MCP servers, discover tools, execute them, and generate training data from tool schemas.

## What is MCP

MCP is a standard protocol for connecting LLMs to external tools and data sources. An MCP server exposes tools (functions with typed parameters) that can be called by an LLM or orchestrator. SiliconDev supports the stdio transport — it launches the server as a subprocess and communicates via stdin/stdout.

## Server Management

Managed in the **Settings** page under "MCP Servers".

### Add Server

Provide:

| Field | Example | Description |
|-------|---------|-------------|
| Name | `filesystem` | Display name |
| Command | `npx` | Executable to run |
| Args | `-y @modelcontextprotocol/server-filesystem /tmp` | Space-separated arguments |

The server config is saved to `~/.silicon-studio/mcp_servers.json`.

### Test Connection

Click "Test" to connect to the server and list its tools. Shows the number of tools found or an error message.

### Remove Server

Removes the config. Does not affect the server binary.

## Tool Discovery

`GET /api/mcp/servers/{id}/tools` connects to the server, initializes a session, calls `list_tools()`, and returns the tool schemas.

Each tool has:

```json
{
  "name": "read_file",
  "description": "Read the contents of a file",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "File path to read" }
    },
    "required": ["path"]
  }
}
```

## Tool Execution

`POST /api/mcp/execute` with `server_id`, `tool_name`, and `tool_args`. The backend connects to the server, calls the tool, and returns the text result.

## Dataset Generation

In the **Data Preparation** page, the MCP tab lets you generate fine-tuning datasets from tool schemas. See [Data Preparation](/features/data-preparation) for details.

## Current Limitations

- MCP tools are not yet callable from the Chat interface. They can be managed and tested, but the model cannot invoke them during inference.
- Only stdio transport is supported (not HTTP/SSE).
- Each tool call creates a new server connection (no persistent sessions).

## Backend Architecture

```
backend/app/mcp/
  __init__.py
  registry.py   -- CRUD for ~/.silicon-studio/mcp_servers.json
  client.py     -- MCP SDK wrapper (StdioServerParameters, ClientSession)
  service.py    -- Orchestrator combining registry + client
```

The client uses the `mcp` Python package. Connection flow:

```python
params = StdioServerParameters(command=cmd, args=args, env=env)
async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
```
