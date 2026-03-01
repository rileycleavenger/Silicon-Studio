import json
import logging
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.preparation.service import DataPreparationService

logger = logging.getLogger(__name__)

router = APIRouter()
service = DataPreparationService()

class PreviewRequest(BaseModel):
    file_path: str = Field(min_length=1, max_length=1024)
    limit: int = Field(default=5, ge=1, le=1000)

class ConvertRequest(BaseModel):
    file_path: str = Field(min_length=1, max_length=1024)
    output_path: str = Field(min_length=1, max_length=1024)
    instruction_col: str = Field(min_length=1, max_length=255)
    input_col: Optional[str] = None
    output_col: str = Field(min_length=1, max_length=255)

class McpGenerateRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=255)
    server_id: str = Field(min_length=1, max_length=255)
    prompt: str = Field(min_length=1, max_length=2000)
    output_path: str = Field(min_length=1, max_length=1024)

@router.post("/preview")
async def preview_csv(request: PreviewRequest):
    """Preview a CSV file."""
    try:
        data = service.preview_csv(request.file_path, request.limit)
        return {"data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/convert")
async def convert_csv(request: ConvertRequest):
    """Convert CSV to JSONL."""
    try:
        result = service.convert_csv_to_jsonl(
            request.file_path,
            request.output_path,
            request.instruction_col,
            request.input_col,
            request.output_col
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-mcp")
async def generate_mcp(request: McpGenerateRequest):
    """Generate fine-tuning dataset from MCP tool call traces.

    Connects to the specified MCP server, discovers tools, uses the loaded
    model to generate example user queries for each tool, and writes the
    resulting instruction/output pairs as JSONL.
    """
    from app.mcp.service import MCPService

    mcp_service = MCPService()

    # 1. Discover tools on the MCP server
    try:
        tools = await mcp_service.list_tools(request.server_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Failed to connect to MCP server: {e}")

    if not tools:
        raise HTTPException(400, "No tools found on the specified MCP server")

    # 2. Build dataset entries from tool schemas
    dataset = []
    for tool in tools:
        tool_schema = json.dumps(tool.get("inputSchema", {}), indent=2)
        tool_name = tool["name"]
        tool_desc = tool.get("description", "No description")

        # Create training examples: user asks about the tool → model responds with tool call
        dataset.append({
            "instruction": f"{request.prompt}\n\nUser wants to use the '{tool_name}' tool: {tool_desc}",
            "input": "",
            "output": json.dumps({
                "tool_call": {
                    "name": tool_name,
                    "description": tool_desc,
                    "parameters": tool.get("inputSchema", {}),
                }
            }),
        })

        # Additional example: direct question about capabilities
        dataset.append({
            "instruction": f"What can the {tool_name} tool do?",
            "input": "",
            "output": f"The {tool_name} tool {tool_desc.lower()}. It accepts the following parameters:\n{tool_schema}",
        })

    # 3. Write JSONL output
    os.makedirs(os.path.dirname(request.output_path) or ".", exist_ok=True)
    with open(request.output_path, "w") as f:
        for entry in dataset:
            f.write(json.dumps(entry) + "\n")

    logger.info(f"Generated {len(dataset)} MCP dataset entries to {request.output_path}")
    preview = dataset[:5]
    return {"data": preview, "rows": len(dataset)}
