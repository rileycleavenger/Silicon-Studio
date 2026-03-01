import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class MCPServerRegistry:
    """Manages configured MCP server definitions stored in ~/.silicon-studio/mcp_servers.json."""

    def __init__(self):
        self.config_path = Path.home() / ".silicon-studio" / "mcp_servers.json"
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.servers: List[Dict[str, Any]] = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        if self.config_path.exists():
            try:
                with open(self.config_path) as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load MCP servers config: {e}")
        return []

    def _save(self):
        with open(self.config_path, "w") as f:
            json.dump(self.servers, f, indent=2)

    def list_servers(self) -> List[Dict[str, Any]]:
        return self.servers

    def add_server(
        self,
        name: str,
        command: str,
        args: List[str] | None = None,
        env: Dict[str, str] | None = None,
        transport: str = "stdio",
    ) -> Dict[str, Any]:
        server = {
            "id": name.lower().replace(" ", "-"),
            "name": name,
            "command": command,
            "args": args or [],
            "env": env or {},
            "transport": transport,
        }
        # Replace existing server with same id
        self.servers = [s for s in self.servers if s["id"] != server["id"]]
        self.servers.append(server)
        self._save()
        return server

    def remove_server(self, server_id: str) -> bool:
        before = len(self.servers)
        self.servers = [s for s in self.servers if s["id"] != server_id]
        if len(self.servers) < before:
            self._save()
            return True
        return False

    def get_server(self, server_id: str) -> Optional[Dict[str, Any]]:
        for s in self.servers:
            if s["id"] == server_id:
                return s
        return None
