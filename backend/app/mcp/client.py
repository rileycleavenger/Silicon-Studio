import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class MCPClient:
    """Connects to MCP servers via stdio transport, discovers tools, and executes them."""

    async def connect_and_list_tools(
        self, command: str, args: List[str], env: Dict[str, str] | None = None
    ) -> List[Dict[str, Any]]:
        """Connect to an MCP server and return its available tools."""
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env if env else None,
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_result = await session.list_tools()
                return [
                    {
                        "name": tool.name,
                        "description": getattr(tool, "description", "") or "",
                        "inputSchema": getattr(tool, "inputSchema", {}) or {},
                    }
                    for tool in tools_result.tools
                ]

    async def execute_tool(
        self,
        command: str,
        args: List[str],
        env: Dict[str, str] | None,
        tool_name: str,
        tool_args: Dict[str, Any],
    ) -> Any:
        """Connect to an MCP server and execute a specific tool."""
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env if env else None,
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, tool_args)
                return result
