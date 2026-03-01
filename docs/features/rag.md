# RAG Knowledge

Source: `src/renderer/src/components/RagKnowledge.tsx`

## Overview

Retrieval-Augmented Generation. Ingest documents into collections, then query them during chat to ground responses in your data.

## Collections

A collection is a named group of document chunks. Stored in `~/.silicon-studio/rag/`.

### Create

Provide a name. The backend creates an empty collection with a UUID.

### Ingest

Upload one or more text files. The backend splits them into chunks using recursive character splitting:

- **Chunk size**: characters per chunk (default 512, configurable in Settings)
- **Chunk overlap**: overlap between consecutive chunks (default 50)

Chunks are stored as JSON alongside the collection metadata.

### Delete

Removes the collection and all its chunks from disk.

## Querying

`POST /api/rag/query` with a collection ID, query string, and result count.

Current implementation: keyword-overlap scoring. The query is tokenized into words, and each chunk is scored by the number of query words it contains. Top-N chunks are returned sorted by score.

**Limitation**: There are no real vector embeddings. The embedding model dropdown in the UI is cosmetic. Scoring is purely lexical. This means semantically similar but lexically different content will not match. This is a known gap planned for improvement.

## Chat Integration

In the Chat parameters sidebar, toggle RAG on and select a collection. When enabled:

1. Before sending to the model, the user's message is used to query the selected collection.
2. Top matching chunks are injected into the system prompt as context.
3. The model sees these chunks as part of its input and can reference them.

RAG context is skipped for quick actions (Longer, Shorter, etc.) to avoid polluting rewrites.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rag/collections` | GET | List all collections |
| `/api/rag/collections` | POST | Create collection |
| `/api/rag/collections/{id}` | DELETE | Delete collection |
| `/api/rag/ingest` | POST | Ingest files into collection |
| `/api/rag/query` | POST | Search collection |

## Backend

Implementation: `backend/app/rag/service.py`

Storage format: `~/.silicon-studio/rag/collections.json` (metadata) and per-collection chunk files.
