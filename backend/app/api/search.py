import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

logger = logging.getLogger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=3, ge=1, le=10)
    extract_content: bool = Field(default=True)


class DeepSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_pages: int = Field(default=5, ge=1, le=10)


class WebResult(BaseModel):
    title: str
    snippet: str
    url: str
    content: Optional[str] = None


async def _fetch_and_extract(url: str, timeout: float = 8.0) -> Optional[str]:
    """Fetch a URL and extract main text content using trafilatura."""
    try:
        import aiohttp
        import trafilatura
    except ImportError:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=timeout),
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
            ) as resp:
                if resp.status != 200:
                    return None
                html = await resp.text(errors="replace")

        # Extract main article text, stripping boilerplate
        text = trafilatura.extract(
            html,
            include_links=False,
            include_images=False,
            include_tables=False,
            favor_recall=True,
        )
        if text and len(text) > 50:
            # Cap at ~2000 chars to keep context manageable
            return text[:2000]
        return None
    except Exception as e:
        logger.debug(f"Failed to extract {url}: {e}")
        return None


@router.post("/web")
async def web_search(req: SearchRequest):
    """Search the web using DuckDuckGo, optionally extracting full page content."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Web search requires duckduckgo-search. Install with: pip install duckduckgo-search",
        )

    try:
        with DDGS() as ddgs:
            raw_results = list(ddgs.text(req.query, max_results=req.max_results))
    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        raise HTTPException(status_code=502, detail=f"Search failed: {str(e)}")

    results: List[dict] = []
    for r in raw_results:
        results.append({
            "title": r["title"],
            "snippet": r["body"],
            "url": r["href"],
            "content": None,
        })

    # If content extraction is requested and trafilatura/aiohttp are available,
    # fetch pages concurrently and extract clean text
    if req.extract_content:
        try:
            import aiohttp  # noqa: F401
            import trafilatura  # noqa: F401

            tasks = [_fetch_and_extract(r["url"]) for r in results]
            extracted = await asyncio.gather(*tasks, return_exceptions=True)

            for i, content in enumerate(extracted):
                if isinstance(content, str):
                    results[i]["content"] = content
        except ImportError:
            pass  # trafilatura/aiohttp not installed — return snippets only

    return {"results": results}


@router.post("/deep")
async def deep_search(req: DeepSearchRequest):
    """Deep search: multiple queries derived from input, with full content extraction.

    Generates 2-3 focused sub-queries from the original, fetches pages in parallel,
    deduplicates by URL, and returns extracted content.
    """
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Deep search requires duckduckgo-search.",
        )

    # Generate sub-queries by splitting on key aspects
    sub_queries = _generate_sub_queries(req.query)

    # Collect URLs from all sub-queries
    seen_urls: set = set()
    all_raw: list = []
    try:
        with DDGS() as ddgs:
            for sq in sub_queries:
                for r in ddgs.text(sq, max_results=req.max_pages):
                    if r["href"] not in seen_urls:
                        seen_urls.add(r["href"])
                        all_raw.append(r)
                        if len(all_raw) >= req.max_pages:
                            break
                if len(all_raw) >= req.max_pages:
                    break
    except Exception as e:
        logger.warning(f"Deep search failed: {e}")
        raise HTTPException(status_code=502, detail=f"Search failed: {str(e)}")

    # Fetch and extract content in parallel
    results = []
    try:
        import aiohttp  # noqa: F401
        import trafilatura  # noqa: F401

        tasks = [_fetch_and_extract(r["href"]) for r in all_raw]
        extracted = await asyncio.gather(*tasks, return_exceptions=True)

        for i, r in enumerate(all_raw):
            content = extracted[i] if isinstance(extracted[i], str) else None
            results.append({
                "title": r["title"],
                "snippet": r["body"],
                "url": r["href"],
                "content": content,
            })
    except ImportError:
        # No trafilatura — return snippets only
        for r in all_raw:
            results.append({
                "title": r["title"],
                "snippet": r["body"],
                "url": r["href"],
                "content": None,
            })

    return {
        "results": results,
        "queries_used": sub_queries,
        "pages_fetched": len(results),
    }


def _generate_sub_queries(query: str) -> List[str]:
    """Split a user query into 2-3 focused sub-queries for broader coverage."""
    # Always include the original
    queries = [query]

    words = query.split()
    if len(words) >= 4:
        # Add a more specific variant
        mid = len(words) // 2
        queries.append(" ".join(words[:mid]) + " explained")
        queries.append(" ".join(words[mid:]) + " guide")
    elif len(words) >= 2:
        queries.append(query + " tutorial")

    return queries[:3]
