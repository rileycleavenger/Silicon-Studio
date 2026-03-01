# Search API

Prefix: `/api/search`

Source: `backend/app/api/search.py`

## Web Search

```
POST /api/search/web
```

```json
{
  "query": "search terms",
  "max_results": 5
}
```

Runs a DuckDuckGo search and returns extracted results.

Response:

```json
{
  "results": [
    {
      "title": "Page Title",
      "snippet": "Brief excerpt from the page...",
      "url": "https://example.com/page"
    }
  ]
}
```

No API key required. Uses DuckDuckGo's public search. Results are text-only (no images or rich media).

Used by the Chat interface when Web Search is enabled in the parameters sidebar. The search query is the user's latest message.
