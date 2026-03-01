# Conversations API

Prefix: `/api/conversations`

Source: `backend/app/api/conversations.py`

## List Conversations

```
GET /api/conversations/
```

Returns summaries (id, title, message count, timestamps, pinned status). Does not include full message content.

## Get Conversation

```
GET /api/conversations/{id}
```

Returns full conversation with all messages.

## Create Conversation

```
POST /api/conversations/
```

```json
{
  "title": "New Chat",
  "messages": [],
  "model_id": "model-uuid"
}
```

All fields are optional. Returns the created conversation.

## Update Conversation

```
PATCH /api/conversations/{id}
```

```json
{
  "title": "Updated Title",
  "messages": [...],
  "pinned": true
}
```

All fields are optional. Only provided fields are updated.

## Delete Conversation

```
DELETE /api/conversations/{id}
```

## Branch Conversation

```
POST /api/conversations/{id}/branch
```

```json
{ "message_index": 5 }
```

Creates a new conversation containing messages 0 through `message_index - 1` from the original. Returns the new conversation.

## Search Conversations

```
POST /api/conversations/search
```

```json
{ "query": "search terms" }
```

Full-text search across conversation titles and message content. Returns matching conversation summaries.
