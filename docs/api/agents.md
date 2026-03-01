# Agents API

Prefix: `/api/agents`

Source: `backend/app/api/agents.py`

## List Workflows

```
GET /api/agents/
```

Returns all saved agent workflow definitions.

## Save Workflow

```
POST /api/agents/
```

```json
{
  "id": "uuid (optional, generated if absent)",
  "name": "My Workflow",
  "description": "Processes input through multiple steps",
  "nodes": [
    { "id": "n1", "type": "input", "data": {} },
    { "id": "n2", "type": "llm", "data": { "prompt": "Summarize: {input}" } },
    { "id": "n3", "type": "output", "data": {} }
  ],
  "edges": [
    { "source": "n1", "target": "n2" },
    { "source": "n2", "target": "n3" }
  ]
}
```

Creates or updates a workflow.

## Delete Workflow

```
DELETE /api/agents/{id}
```

## Execute Workflow

```
POST /api/agents/{id}/execute
```

```json
{ "input": "Text to process" }
```

**Note**: Execution is currently mocked. Returns placeholder results per node. No real LLM inference or tool execution occurs.

Response:

```json
{
  "steps": [
    { "node_id": "n1", "type": "input", "result": "Text to process" },
    { "node_id": "n2", "type": "llm", "result": "Processed \"Text to process\" via llm node" },
    { "node_id": "n3", "type": "output", "result": "Processed \"Text to process\" via output node" }
  ]
}
```
