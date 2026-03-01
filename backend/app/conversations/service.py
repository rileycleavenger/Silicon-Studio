import json
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class ConversationService:
    def __init__(self):
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.conversations_dir = self.workspace_dir / "conversations"
        self.conversations_dir.mkdir(parents=True, exist_ok=True)

    def list_conversations(self) -> List[Dict[str, Any]]:
        """Return all conversations sorted by pinned + updated_at desc, without messages."""
        results = []
        for path in self.conversations_dir.glob("*.json"):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                summary = {
                    "id": data["id"],
                    "title": data.get("title", "Untitled"),
                    "model_id": data.get("model_id"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "message_count": data.get("message_count", 0),
                    "pinned": data.get("pinned", False),
                }
                if "branched_from" in data:
                    summary["branched_from"] = data["branched_from"]
                results.append(summary)
            except Exception as e:
                logger.warning(f"Failed to read conversation {path.name}: {e}")
        results.sort(
            key=lambda c: (c.get("pinned", False), c.get("updated_at", "")),
            reverse=True,
        )
        return results

    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Return full conversation including messages."""
        path = self.conversations_dir / f"{conversation_id}.json"
        if not path.exists():
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load conversation {conversation_id}: {e}")
            return None

    def create_conversation(
        self,
        title: str = "New conversation",
        messages: Optional[List[Dict[str, Any]]] = None,
        model_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        conversation = {
            "id": str(uuid.uuid4()),
            "title": title,
            "messages": messages or [],
            "model_id": model_id,
            "created_at": now,
            "updated_at": now,
            "message_count": len(messages) if messages else 0,
            "pinned": False,
        }
        self._save(conversation)
        return conversation

    def update_conversation(
        self, conversation_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Partial update: title, messages, model_id, pinned."""
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return None
        allowed_keys = {"title", "messages", "model_id", "pinned"}
        for key in allowed_keys:
            if key in updates:
                conversation[key] = updates[key]
        if "messages" in updates:
            conversation["message_count"] = len(updates["messages"])
        conversation["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._save(conversation)
        return conversation

    def delete_conversation(self, conversation_id: str) -> bool:
        path = self.conversations_dir / f"{conversation_id}.json"
        if path.exists():
            path.unlink()
            return True
        return False

    def search_conversations(self, query: str) -> List[Dict[str, Any]]:
        """Full-text search across all conversations."""
        query_lower = query.lower()
        results = []
        for path in self.conversations_dir.glob("*.json"):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                # Search title first
                if query_lower in data.get("title", "").lower():
                    results.append(self._summary(data, match_context=data["title"]))
                    continue
                # Search message contents
                for msg in data.get("messages", []):
                    content = msg.get("content", "")
                    if query_lower in content.lower():
                        idx = content.lower().index(query_lower)
                        start = max(0, idx - 40)
                        end = min(len(content), idx + len(query) + 40)
                        snippet = (
                            ("..." if start > 0 else "")
                            + content[start:end]
                            + ("..." if end < len(content) else "")
                        )
                        results.append(self._summary(data, match_context=snippet))
                        break
            except Exception as e:
                logger.warning(f"Search error for {path.name}: {e}")
        results.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
        return results

    def branch_conversation(
        self, conversation_id: str, message_index: int
    ) -> Optional[Dict[str, Any]]:
        """Create a new conversation branching from a specific message index."""
        source = self.get_conversation(conversation_id)
        if not source:
            return None
        messages = source.get("messages", [])
        if message_index < 0 or message_index >= len(messages):
            return None
        branched_messages = messages[: message_index + 1]
        now = datetime.now(timezone.utc).isoformat()
        title = source.get("title", "Untitled")
        branch = {
            "id": str(uuid.uuid4()),
            "title": f"{title} (branch)",
            "messages": branched_messages,
            "model_id": source.get("model_id"),
            "created_at": now,
            "updated_at": now,
            "message_count": len(branched_messages),
            "pinned": False,
            "branched_from": {
                "conversation_id": conversation_id,
                "message_index": message_index,
            },
        }
        self._save(branch)
        return branch

    def _summary(
        self, data: Dict[str, Any], match_context: str = ""
    ) -> Dict[str, Any]:
        result = {
            "id": data["id"],
            "title": data.get("title", "Untitled"),
            "model_id": data.get("model_id"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
            "message_count": data.get("message_count", 0),
            "pinned": data.get("pinned", False),
            "match_context": match_context,
        }
        if "branched_from" in data:
            result["branched_from"] = data["branched_from"]
        return result

    def _save(self, conversation: Dict[str, Any]):
        path = self.conversations_dir / f"{conversation['id']}.json"
        with open(path, "w") as f:
            json.dump(conversation, f, indent=2)
