# Agent Workflows

Source: `src/renderer/src/components/AgentWorkflows.tsx`

## Overview

Visual workflow builder for defining multi-step agent pipelines. Workflows are composed of nodes connected by edges.

## Current State

Agent execution is **mocked**. The backend processes nodes sequentially and returns placeholder results. There is no real tool execution, LLM calls, or external integrations in the agent pipeline. This is a work-in-progress feature.

## Workflow Definition

A workflow consists of:

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `name` | Display name |
| `description` | Optional description |
| `nodes` | Array of processing steps |
| `edges` | Connections between nodes |

### Node Types

| Type | Description |
|------|-------------|
| `input` | Entry point, receives user input |
| `llm` | (Mocked) LLM inference step |
| `tool` | (Mocked) Tool execution step |
| `condition` | (Mocked) Branching logic |
| `output` | Terminal node, returns result |

### Edges

Each edge connects a source node to a target node, defining the execution order.

## Operations

| Action | Description |
|--------|-------------|
| Create | Define a new workflow with nodes and edges |
| Edit | Modify an existing workflow |
| Delete | Remove a workflow |
| Execute | Run the workflow with an input string |

## Execution

`POST /api/agents/{id}/execute` with `{ input: "..." }`.

The backend iterates nodes in order. For each node, it returns a placeholder string:

```
Processed "{input}" via {node_type} node
```

No real LLM calls, tool executions, or conditional branching are implemented.

## Storage

Workflows are stored in `~/.silicon-studio/agents/agents.json`.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/` | GET | List all workflows |
| `/api/agents/` | POST | Create/update workflow |
| `/api/agents/{id}` | DELETE | Delete workflow |
| `/api/agents/{id}/execute` | POST | Execute workflow |

## Planned Improvements

- Real LLM inference at `llm` nodes using the loaded model
- MCP tool binding at `tool` nodes
- Conditional branching evaluation
- Visual canvas/graph editor
- Step-by-step execution with intermediate results
