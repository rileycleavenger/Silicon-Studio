# MCP API

Prefix: `/api/mcp`

Source: `backend/app/api/mcp.py`

## List Servers

```
GET /api/mcp/servers
```

Returns all configured MCP server entries.

## Add Server

```
POST /api/mcp/servers
```

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {},
  "transport": "stdio"
}
```

`env` and `transport` are optional (defaults: `{}` and `"stdio"`).

## Remove Server

```
DELETE /api/mcp/servers/{server_id}
```

## List Tools

```
GET /api/mcp/servers/{server_id}/tools
```

Connects to the server, initializes a session, and returns discovered tools:

```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read the contents of a file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

## Execute Tool

```
POST /api/mcp/execute
```

```json
{
  "server_id": "uuid",
  "tool_name": "read_file",
  "tool_args": { "path": "/tmp/test.txt" }
}
```

Returns:

```json
{
  "result": "File contents here..."
}
```

The result is the concatenated text content from the MCP tool response.
