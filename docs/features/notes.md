# Notes

Source: `src/renderer/src/components/Workspace.tsx`

## Overview

Markdown editor for taking notes alongside AI work. Notes are stored locally and can be sent to chat as context.

## Editor

- Markdown editing with live preview (SimpleMDE-based)
- Auto-save on a debounced timer (flushes on unmount and note switch)
- Character count in the note metadata

## Note Management

Notes appear in the left sidebar under "Notes" when expanded.

| Action | Description |
|--------|-------------|
| Create | Click `+` or start typing in an empty workspace |
| Rename | Right-click or use the rename action |
| Pin | Pinned notes sort to the top |
| Delete | Remove note from disk |
| Export | Download as `.md` file (filename based on note title) |

## Chat Integration

Click "Send to Chat" to inject the note content into the chat input. This sets `pendingChatInput` in the global state, which the Chat tab picks up and pre-fills into the message input.

## Storage

Notes are JSON files in `~/.silicon-studio/notes/`:

```json
{
  "id": "uuid",
  "title": "My Note",
  "content": "# Markdown content here",
  "pinned": false,
  "created_at": "2026-01-15T10:30:00",
  "updated_at": "2026-01-15T11:00:00",
  "char_count": 1234
}
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notes/` | GET | List notes (title, metadata only) |
| `/api/notes/{id}` | GET | Fetch full note with content |
| `/api/notes/` | POST | Create note |
| `/api/notes/{id}` | PATCH | Update note |
| `/api/notes/{id}` | DELETE | Delete note |
