import json
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NotesService:
    def __init__(self):
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.notes_dir = self.workspace_dir / "notes"
        self.notes_dir.mkdir(parents=True, exist_ok=True)

    def list_notes(self) -> List[Dict[str, Any]]:
        """Return all notes sorted by pinned + updated_at desc, without content."""
        results = []
        for path in self.notes_dir.glob("*.json"):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                results.append({
                    "id": data["id"],
                    "title": data.get("title", "Untitled"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "pinned": data.get("pinned", False),
                    "char_count": len(data.get("content", "")),
                })
            except Exception as e:
                logger.warning(f"Failed to read note {path.name}: {e}")
        results.sort(
            key=lambda n: (n.get("pinned", False), n.get("updated_at", "")),
            reverse=True,
        )
        return results

    def get_note(self, note_id: str) -> Optional[Dict[str, Any]]:
        """Return full note including content."""
        path = self.notes_dir / f"{note_id}.json"
        if not path.exists():
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load note {note_id}: {e}")
            return None

    def create_note(self, title: str = "Untitled", content: str = "") -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        note = {
            "id": str(uuid.uuid4()),
            "title": title,
            "content": content,
            "created_at": now,
            "updated_at": now,
            "pinned": False,
        }
        self._save(note)
        return note

    def update_note(self, note_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Partial update: title, content, pinned."""
        note = self.get_note(note_id)
        if not note:
            return None
        allowed_keys = {"title", "content", "pinned"}
        for key in allowed_keys:
            if key in updates:
                note[key] = updates[key]
        note["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._save(note)
        return note

    def delete_note(self, note_id: str) -> bool:
        path = self.notes_dir / f"{note_id}.json"
        if path.exists():
            path.unlink()
            return True
        return False

    def _save(self, note: Dict[str, Any]):
        path = self.notes_dir / f"{note['id']}.json"
        with open(path, "w") as f:
            json.dump(note, f, indent=2)
