import logging
from typing import Dict, Any, List

from .registry import MCPServerRegistry
from .client import MCPClient

logger = logging.getLogger(__name__)


class MCPService:
    """Orchestrates MCP server management and tool execution."""

    def __init__(self):
        self.registry = MCPServerRegistry()
        self.client = MCPClient()

    def list_servers(self) -> List[Dict[str, Any]]:
        return self.registry.list_servers()

    def add_server(self, **kwargs) -> Dict[str, Any]:
        return self.registry.add_server(**kwargs)

    def remove_server(self, server_id: str) -> bool:
        return self.registry.remove_server(server_id)

    async def list_tools(self, server_id: str) -> List[Dict[str, Any]]:
        server = self.registry.get_server(server_id)
        if not server:
            raise ValueError(f"MCP server '{server_id}' not found")
        return await self.client.connect_and_list_tools(
            server["command"], server.get("args", []), server.get("env", {})
        )

    async def execute_tool(
        self, server_id: str, tool_name: str, tool_args: Dict[str, Any]
    ) -> Any:
        server = self.registry.get_server(server_id)
        if not server:
            raise ValueError(f"MCP server '{server_id}' not found")
        return await self.client.execute_tool(
            server["command"],
            server.get("args", []),
            server.get("env", {}),
            tool_name,
            tool_args,
        )
