"""Background indexing pipeline for continuous web content ingestion.

Maintains a user-configurable list of URLs/domains to periodically crawl,
extract content, chunk, embed, and store in a dedicated RAG collection.
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CONFIG_FILE = "indexer_sources.json"
STATE_FILE = "indexer_state.json"
COLLECTION_NAME = "__web_index__"
DEFAULT_CHUNK_SIZE = 512
DEFAULT_OVERLAP = 64
DEFAULT_INTERVAL_MINUTES = 60


class BackgroundIndexer:
    """Manages a crawl list and periodically indexes web content."""

    def __init__(self):
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ── Source management ────────────────────────────────────

    def _config_path(self) -> Path:
        return self.workspace_dir / CONFIG_FILE

    def _state_path(self) -> Path:
        return self.workspace_dir / STATE_FILE

    def get_sources(self) -> List[Dict[str, Any]]:
        path = self._config_path()
        if not path.exists():
            return []
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return []

    def add_source(self, url: str, label: Optional[str] = None) -> Dict[str, Any]:
        sources = self.get_sources()
        # Deduplicate by URL
        for s in sources:
            if s["url"] == url:
                return s
        source = {
            "id": str(uuid.uuid4()),
            "url": url,
            "label": label or url,
            "added": int(time.time()),
            "enabled": True,
        }
        sources.append(source)
        self._save_sources(sources)
        return source

    def remove_source(self, source_id: str) -> bool:
        sources = self.get_sources()
        before = len(sources)
        sources = [s for s in sources if s["id"] != source_id]
        if len(sources) < before:
            self._save_sources(sources)
            return True
        return False

    def toggle_source(self, source_id: str, enabled: bool) -> bool:
        sources = self.get_sources()
        for s in sources:
            if s["id"] == source_id:
                s["enabled"] = enabled
                self._save_sources(sources)
                return True
        return False

    def _save_sources(self, sources: List[Dict[str, Any]]):
        with open(self._config_path(), "w") as f:
            json.dump(sources, f, indent=2)

    # ── Crawl state ──────────────────────────────────────────

    def get_state(self) -> Dict[str, Any]:
        path = self._state_path()
        if not path.exists():
            return {"last_run": None, "sources": {}, "collection_id": None}
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return {"last_run": None, "sources": {}, "collection_id": None}

    def _save_state(self, state: Dict[str, Any]):
        with open(self._state_path(), "w") as f:
            json.dump(state, f, indent=2)

    # ── Crawl + index ────────────────────────────────────────

    async def crawl_and_index(self) -> Dict[str, Any]:
        """Crawl all enabled sources, extract content, and index into RAG.

        Returns summary of the crawl run.
        """
        sources = self.get_sources()
        enabled = [s for s in sources if s.get("enabled", True)]

        if not enabled:
            return {"status": "no_sources", "indexed": 0}

        state = self.get_state()

        # Ensure we have a dedicated collection
        collection_id = state.get("collection_id")
        if not collection_id:
            from app.rag.service import RagService
            rag = RagService()
            col = rag.create_collection(COLLECTION_NAME)
            collection_id = col["id"]
            state["collection_id"] = collection_id

        # Fetch pages concurrently
        try:
            import aiohttp  # noqa: F401
            import trafilatura  # noqa: F401
        except ImportError:
            return {"status": "missing_deps", "detail": "aiohttp and trafilatura required"}

        results = []
        tasks = []
        for src in enabled:
            tasks.append(self._fetch_source(src["url"], src["id"], state))

        fetched = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(fetched):
            if isinstance(result, dict) and result.get("content"):
                results.append(result)

        if not results:
            state["last_run"] = int(time.time())
            self._save_state(state)
            return {"status": "ok", "indexed": 0, "fetched": len(enabled)}

        # Chunk and ingest into RAG
        from app.rag.service import RagService
        rag = RagService()

        all_chunks: List[str] = []
        for r in results:
            chunks = rag._recursive_split(r["content"], DEFAULT_CHUNK_SIZE)
            if DEFAULT_OVERLAP > 0 and len(chunks) > 1:
                overlapped = [chunks[0][:DEFAULT_CHUNK_SIZE]]
                for j in range(1, len(chunks)):
                    prev = overlapped[-1]
                    prefix = prev[-DEFAULT_OVERLAP:] if DEFAULT_OVERLAP < len(prev) else prev
                    overlapped.append((prefix + chunks[j])[:DEFAULT_CHUNK_SIZE])
                chunks = overlapped
            all_chunks.extend(chunks)

        if all_chunks:
            # Append to existing chunks
            chunks_file = rag.rag_dir / f"{collection_id}_chunks.json"
            existing: List[str] = []
            if chunks_file.exists():
                try:
                    with open(chunks_file, "r") as f:
                        existing = json.load(f)
                except Exception:
                    existing = []

            existing.extend(all_chunks)
            with open(chunks_file, "w") as f:
                json.dump(existing, f)

            # Rebuild embeddings
            rag._rebuild_embeddings(collection_id, existing)

            # Update collection metadata
            collections = rag.get_collections()
            col = next((c for c in collections if c["id"] == collection_id), None)
            if col:
                col["chunks"] = len(existing)
                kb = sum(len(c.encode("utf-8")) for c in existing) // 1024
                col["size"] = f"{kb} KB"
                col["_total_kb"] = kb
                col["lastUpdated"] = "Just now"
                rag._save_collections(collections)

        state["last_run"] = int(time.time())
        self._save_state(state)

        return {
            "status": "ok",
            "indexed": len(all_chunks),
            "fetched": len(results),
            "total_sources": len(enabled),
        }

    async def _fetch_source(
        self, url: str, source_id: str, state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Fetch a single URL and extract text content."""
        import aiohttp
        import trafilatura

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
                ) as resp:
                    if resp.status != 200:
                        return {"source_id": source_id, "url": url, "content": None}
                    html = await resp.text(errors="replace")

            text = trafilatura.extract(
                html,
                include_links=False,
                include_images=False,
                include_tables=False,
                favor_recall=True,
            )

            if text and len(text) > 50:
                # Update per-source state
                source_state = state.get("sources", {})
                source_state[source_id] = {
                    "last_crawled": int(time.time()),
                    "chars": len(text),
                }
                state["sources"] = source_state

                return {"source_id": source_id, "url": url, "content": text}
            return {"source_id": source_id, "url": url, "content": None}
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
            return {"source_id": source_id, "url": url, "content": None}

    # ── Background loop ──────────────────────────────────────

    def start_background(self, interval_minutes: int = DEFAULT_INTERVAL_MINUTES):
        """Start a periodic background crawl task."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._background_loop(interval_minutes))
        logger.info("Background indexer started (interval=%dm)", interval_minutes)

    def stop_background(self):
        """Stop the background crawl task."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
            logger.info("Background indexer stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def _background_loop(self, interval_minutes: int):
        """Run crawl_and_index periodically."""
        while self._running:
            try:
                result = await self.crawl_and_index()
                logger.info("Background crawl complete: %s", result)
            except Exception as e:
                logger.warning("Background crawl error: %s", e)
            await asyncio.sleep(interval_minutes * 60)


# Module-level singleton
indexer = BackgroundIndexer()
