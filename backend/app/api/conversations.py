from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.conversations.service import ConversationService

router = APIRouter()
service = ConversationService()


class ConversationCreate(BaseModel):
    title: str = Field(default="New conversation", max_length=500)
    messages: Optional[List[Dict[str, Any]]] = None
    model_id: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    model_id: Optional[str] = None
    pinned: Optional[bool] = None


class SearchQuery(BaseModel):
    q: str = Field(min_length=1, max_length=500)


class BranchRequest(BaseModel):
    message_index: int = Field(ge=0)


@router.get("/")
async def list_conversations():
    return service.list_conversations()


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = service.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/")
async def create_conversation(req: ConversationCreate):
    return service.create_conversation(
        title=req.title,
        messages=req.messages,
        model_id=req.model_id,
    )


@router.patch("/{conversation_id}")
async def update_conversation(conversation_id: str, req: ConversationUpdate):
    updates = req.model_dump(exclude_none=True)
    conv = service.update_conversation(conversation_id, updates)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    if service.delete_conversation(conversation_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Conversation not found")


@router.post("/{conversation_id}/branch")
async def branch_conversation(conversation_id: str, req: BranchRequest):
    conv = service.branch_conversation(conversation_id, req.message_index)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found or invalid message index")
    return conv


@router.post("/search")
async def search_conversations(req: SearchQuery):
    return service.search_conversations(req.q)
