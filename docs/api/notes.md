# Notes API

Prefix: `/api/notes`

Source: `backend/app/api/notes.py`

## List Notes

```
GET /api/notes/
```

Returns note summaries (id, title, pinned, timestamps, char_count). Content is not included.

## Get Note

```
GET /api/notes/{id}
```

Returns full note with content.

## Create Note

```
POST /api/notes/
```

```json
{
  "title": "My Note",
  "content": "# Markdown here"
}
```

Both fields are optional. Defaults to empty title and content.

## Update Note

```
PATCH /api/notes/{id}
```

```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "pinned": true
}
```

All fields are optional.

## Delete Note

```
DELETE /api/notes/{id}
```
