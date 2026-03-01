# Chat API

Prefix: `/api/engine`

Source: `backend/app/api/engine.py`

## Stream Chat

```
POST /api/engine/chat
```

```json
{
  "model_id": "model-uuid",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "top_p": 0.9,
  "repetition_penalty": 1.1,
  "stream": true
}
```

Returns Server-Sent Events:

```
data: {"token": "Hello", "done": false}
data: {"token": " there", "done": false}
data: {"token": "", "done": true, "stats": {"tokens_per_second": 42.5, "time_to_first_token": 0.15, "total_tokens": 23}}
```

The final event has `done: true` and includes generation statistics.

### Context Building

Before sending to MLX, the backend may augment the message array:

1. **RAG context**: If the frontend sends `rag_collection_id`, the backend queries the collection and prepends matching chunks to the system message.
2. **Web search**: If the frontend sends `web_search: true`, the backend runs a DuckDuckGo search and prepends results.
3. **Reasoning mode**: If set, a reasoning instruction is appended to the system prompt.

### Message Format

Messages follow the OpenAI format:

```json
[
  { "role": "system", "content": "..." },
  { "role": "user", "content": "..." },
  { "role": "assistant", "content": "..." }
]
```

## Stop Generation

```
POST /api/engine/chat/stop
```

Cancels the current generation. Returns `{ "status": "stopped" }`.
