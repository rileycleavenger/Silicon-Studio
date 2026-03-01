import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any

from app.mcp.service import MCPService

logger = logging.getLogger(__name__)
router = APIRouter()
service = MCPService()


class AddServerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    command: str = Field(min_length=1, max_length=1024)
    args: List[str] = Field(default=[], max_length=50)
    env: Dict[str, str] = {}
    transport: str = Field(default="stdio", max_length=20)


class ExecuteToolRequest(BaseModel):
    server_id: str = Field(min_length=1, max_length=255)
    tool_name: str = Field(min_length=1, max_length=255)
    tool_args: Dict[str, Any] = {}


@router.get("/servers")
async def list_servers():
    """List all configured MCP servers."""
    return service.list_servers()


@router.post("/servers")
async def add_server(request: AddServerRequest):
    """Add or update an MCP server configuration."""
    return service.add_server(
        name=request.name,
        command=request.command,
        args=request.args,
        env=request.env,
        transport=request.transport,
    )


@router.delete("/servers/{server_id}")
async def remove_server(server_id: str):
    """Remove an MCP server configuration."""
    if not service.remove_server(server_id):
        raise HTTPException(404, "Server not found")
    return {"status": "removed"}


@router.get("/servers/{server_id}/tools")
async def list_tools(server_id: str):
    """Discover available tools on an MCP server."""
    try:
        tools = await service.list_tools(server_id)
        return {"tools": tools}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Failed to list tools for {server_id}: {e}")
        raise HTTPException(500, f"Failed to connect to MCP server: {e}")


@router.post("/execute")
async def execute_tool(request: ExecuteToolRequest):
    """Execute a tool on an MCP server."""
    try:
        result = await service.execute_tool(
            request.server_id, request.tool_name, request.tool_args
        )
        # Convert MCP result to a serializable format
        content = ""
        if hasattr(result, "content"):
            for item in result.content:
                if hasattr(item, "text"):
                    content += item.text
                else:
                    content += str(item)
        else:
            content = str(result)
        return {"result": content}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Failed to execute tool {request.tool_name}: {e}")
        raise HTTPException(500, f"Tool execution failed: {e}")
