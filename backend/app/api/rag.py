from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from app.rag.service import RagService

router = APIRouter()
service = RagService()

class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)

class IngestRequest(BaseModel):
    collection_id: str
    files: List[str] = Field(min_length=1)
    chunk_size: int = Field(default=512, ge=64, le=8192)
    overlap: int = Field(default=50, ge=0, le=4096)

class QueryRequest(BaseModel):
    collection_id: str
    query: str = Field(min_length=1)
    n_results: int = Field(default=5, ge=1, le=20)

@router.get("/collections")
async def get_collections():
    return service.get_collections()

@router.post("/collections")
async def create_collection(req: CollectionCreate):
    return service.create_collection(req.name)

@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    if service.delete_collection(collection_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Collection not found")

@router.post("/ingest")
async def ingest_files(req: IngestRequest):
    try:
        return service.ingest_files(req.collection_id, req.files, req.chunk_size, req.overlap)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/query")
async def query_collection(req: QueryRequest):
    results = service.query(req.collection_id, req.query, req.n_results)
    return {"results": results}
