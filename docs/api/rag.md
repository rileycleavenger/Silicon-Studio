# RAG API

Prefix: `/api/rag`

Source: `backend/app/api/rag.py`

## List Collections

```
GET /api/rag/collections
```

Returns array of collections with metadata (id, name, chunk count, creation date).

## Create Collection

```
POST /api/rag/collections
```

```json
{ "name": "My Knowledge Base" }
```

Returns the created collection object.

## Delete Collection

```
DELETE /api/rag/collections/{id}
```

Removes collection and all associated chunks.

## Ingest Files

```
POST /api/rag/ingest
```

Multipart form data:

| Field | Type | Description |
|-------|------|-------------|
| `collection_id` | string | Target collection UUID |
| `files` | file[] | One or more text files |
| `chunk_size` | int | Characters per chunk (default 512) |
| `chunk_overlap` | int | Overlap between chunks (default 50) |

Splits files into chunks using recursive character splitting and stores them in the collection.

## Query Collection

```
POST /api/rag/query
```

```json
{
  "collection_id": "uuid",
  "query": "search terms",
  "n_results": 5
}
```

Returns top-N matching chunks sorted by relevance score. Current scoring: keyword overlap (not vector similarity).

Response:

```json
{
  "results": [
    {
      "text": "chunk content...",
      "score": 0.85,
      "metadata": { "source": "filename.txt", "chunk_index": 3 }
    }
  ]
}
```
