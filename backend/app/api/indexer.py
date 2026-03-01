"""API endpoints for the background web indexer."""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter()


class AddSourceRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    label: Optional[str] = Field(default=None, max_length=200)


class ToggleSourceRequest(BaseModel):
    enabled: bool


@router.get("/sources")
async def list_sources():
    """List all configured indexer sources."""
    from app.search.indexer import indexer
    return {"sources": indexer.get_sources()}


@router.post("/sources")
async def add_source(req: AddSourceRequest):
    """Add a URL to the indexer crawl list."""
    from app.search.indexer import indexer
    source = indexer.add_source(req.url, req.label)
    return source


@router.delete("/sources/{source_id}")
async def remove_source(source_id: str):
    """Remove a URL from the indexer crawl list."""
    from app.search.indexer import indexer
    if not indexer.remove_source(source_id):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@router.put("/sources/{source_id}/toggle")
async def toggle_source(source_id: str, req: ToggleSourceRequest):
    """Enable or disable a source."""
    from app.search.indexer import indexer
    if not indexer.toggle_source(source_id, req.enabled):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@router.post("/crawl")
async def trigger_crawl():
    """Manually trigger a crawl of all enabled sources."""
    from app.search.indexer import indexer
    result = await indexer.crawl_and_index()
    return result


@router.get("/status")
async def indexer_status():
    """Get indexer status: running state, last run time, source count."""
    from app.search.indexer import indexer
    state = indexer.get_state()
    sources = indexer.get_sources()
    return {
        "running": indexer.is_running,
        "last_run": state.get("last_run"),
        "collection_id": state.get("collection_id"),
        "total_sources": len(sources),
        "enabled_sources": sum(1 for s in sources if s.get("enabled", True)),
    }


@router.post("/start")
async def start_indexer(interval_minutes: int = 60):
    """Start the background indexer with the given interval."""
    from app.search.indexer import indexer
    if indexer.is_running:
        return {"status": "already_running"}
    indexer.start_background(interval_minutes)
    return {"status": "started", "interval_minutes": interval_minutes}


@router.post("/stop")
async def stop_indexer():
    """Stop the background indexer."""
    from app.search.indexer import indexer
    indexer.stop_background()
    return {"status": "stopped"}
