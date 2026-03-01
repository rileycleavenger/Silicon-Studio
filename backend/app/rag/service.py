import os
import re
import json
import uuid
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class RagService:
    def __init__(self):
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.rag_dir = self.workspace_dir / "rag"
        self.collections_file = self.rag_dir / "collections.json"

        self.rag_dir.mkdir(parents=True, exist_ok=True)
        if not self.collections_file.exists():
            with open(self.collections_file, "w") as f:
                json.dump([], f)

    # ── Collections CRUD ────────────────────────────────────

    def get_collections(self) -> List[Dict[str, Any]]:
        try:
            with open(self.collections_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load collections: {e}")
            return []

    def create_collection(self, name: str) -> Dict[str, Any]:
        collections = self.get_collections()
        new_col = {
            "id": str(uuid.uuid4()),
            "name": name,
            "chunks": 0,
            "size": "0 KB",
            "lastUpdated": "Just now",
            "model": "all-MiniLM-L6-v2",
        }
        collections.append(new_col)
        self._save_collections(collections)
        return new_col

    def delete_collection(self, collection_id: str) -> bool:
        collections = self.get_collections()
        initial_len = len(collections)
        collections = [c for c in collections if c["id"] != collection_id]
        if len(collections) < initial_len:
            self._save_collections(collections)
            # Clean up chunk and embedding files
            for suffix in ("_chunks.json", "_embeddings.npy"):
                p = self.rag_dir / f"{collection_id}{suffix}"
                if p.exists():
                    p.unlink()
            return True
        return False

    # ── Ingest ──────────────────────────────────────────────

    def ingest_files(
        self,
        collection_id: str,
        files: List[str],
        chunk_size: int,
        overlap: int,
    ) -> Dict[str, Any]:
        """Ingest files into a collection: chunk, embed, and persist."""
        collections = self.get_collections()
        col = next((c for c in collections if c["id"] == collection_id), None)
        if not col:
            raise ValueError("Collection not found")

        all_chunks: List[str] = []
        for file_path in files:
            path = Path(file_path)
            if not path.exists():
                continue

            paths_to_process: List[Path] = []
            if path.is_dir():
                for root, _, filenames in os.walk(path):
                    for name in filenames:
                        candidate = Path(root) / name
                        if candidate.is_file():
                            paths_to_process.append(candidate)
            elif path.is_file():
                paths_to_process.append(path)

            for file_to_process in paths_to_process:
                try:
                    with open(
                        file_to_process, "r", encoding="utf-8", errors="ignore"
                    ) as f:
                        text = f.read()

                    base_chunks = self._recursive_split(text, chunk_size)

                    if overlap > 0 and len(base_chunks) > 1:
                        chunks: List[str] = [base_chunks[0][:chunk_size]]
                        for i in range(1, len(base_chunks)):
                            prev = chunks[-1]
                            prefix = prev[-overlap:] if overlap < len(prev) else prev
                            chunks.append((prefix + base_chunks[i])[:chunk_size])
                    else:
                        chunks = base_chunks

                    all_chunks.extend(chunks)
                except Exception as e:
                    logger.warning(f"Error processing {file_to_process}: {e}")

        # Load existing chunks
        chunks_file = self.rag_dir / f"{collection_id}_chunks.json"
        existing_chunks: List[str] = []
        if chunks_file.exists():
            try:
                with open(chunks_file, "r") as f:
                    existing_chunks = json.load(f)
            except Exception:
                existing_chunks = []

        existing_chunks.extend(all_chunks)

        # Save chunks
        with open(chunks_file, "w") as f:
            json.dump(existing_chunks, f)

        # Compute and save embeddings
        self._rebuild_embeddings(collection_id, existing_chunks)

        # Update collection metadata
        col["chunks"] = len(existing_chunks)
        estimated_kb = sum(len(c.encode("utf-8")) for c in existing_chunks) // 1024
        col["size"] = f"{estimated_kb} KB"
        col["_total_kb"] = estimated_kb
        col["lastUpdated"] = "Just now"

        self._save_collections(collections)
        return col

    # ── Query (hybrid search) ───────────────────────────────

    def query(
        self, collection_id: str, query_text: str, n_results: int = 5
    ) -> List[Dict[str, Any]]:
        """Hybrid search: BM25 + vector similarity with reciprocal rank fusion."""
        chunks_file = self.rag_dir / f"{collection_id}_chunks.json"
        if not chunks_file.exists():
            return []
        try:
            with open(chunks_file, "r") as f:
                chunks: List[str] = json.load(f)
        except Exception:
            return []

        if not chunks:
            return []

        # Collect results from both methods
        bm25_results = self._bm25_search(chunks, query_text, n=20)
        vector_results = self._vector_search(collection_id, chunks, query_text, n=20)

        # Fuse with RRF if both produced results
        if bm25_results and vector_results:
            fused = self._reciprocal_rank_fusion(bm25_results, vector_results)
        elif vector_results:
            fused = vector_results
        else:
            fused = bm25_results

        return fused[:n_results]

    # ── BM25 search ─────────────────────────────────────────

    def _bm25_search(
        self, chunks: List[str], query_text: str, n: int = 20
    ) -> List[Dict[str, Any]]:
        """BM25 keyword search using rank_bm25."""
        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            return self._keyword_search(chunks, query_text, n)

        tokenized_corpus = [re.findall(r"\w+", c.lower()) for c in chunks]
        query_tokens = re.findall(r"\w+", query_text.lower())

        if not query_tokens:
            return []

        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(query_tokens)

        scored = []
        for i, score in enumerate(scores):
            if score > 0:
                scored.append(
                    {"text": chunks[i], "score": float(score), "index": i, "method": "bm25"}
                )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:n]

    def _keyword_search(
        self, chunks: List[str], query_text: str, n: int = 20
    ) -> List[Dict[str, Any]]:
        """Simple keyword overlap fallback when rank_bm25 is not installed."""
        query_terms = set(re.findall(r"\w+", query_text.lower()))
        scored = []
        for i, chunk in enumerate(chunks):
            chunk_lower = chunk.lower()
            term_hits = sum(1 for t in query_terms if t in chunk_lower)
            exact_bonus = 2 if query_text.lower() in chunk_lower else 0
            score = term_hits + exact_bonus
            if score > 0:
                scored.append(
                    {"text": chunk, "score": score, "index": i, "method": "keyword"}
                )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:n]

    # ── Vector search ───────────────────────────────────────

    def _vector_search(
        self,
        collection_id: str,
        chunks: List[str],
        query_text: str,
        n: int = 20,
    ) -> List[Dict[str, Any]]:
        """Cosine similarity search using local embeddings."""
        from app.rag.embeddings import embedder

        if not embedder.available:
            return []

        emb_file = self.rag_dir / f"{collection_id}_embeddings.npy"
        if not emb_file.exists():
            return []

        try:
            chunk_embs = np.load(str(emb_file))
        except Exception:
            return []

        if len(chunk_embs) != len(chunks):
            # Embeddings out of sync — rebuild
            self._rebuild_embeddings(collection_id, chunks)
            try:
                chunk_embs = np.load(str(emb_file))
            except Exception:
                return []

        try:
            query_emb = embedder.embed([query_text])
            scores = embedder.similarity(query_emb, chunk_embs)
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")
            return []

        scored = []
        for i, score in enumerate(scores):
            if score > 0.1:  # minimum similarity threshold
                scored.append(
                    {"text": chunks[i], "score": float(score), "index": i, "method": "vector"}
                )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:n]

    # ── Reciprocal Rank Fusion ──────────────────────────────

    def _reciprocal_rank_fusion(
        self, *result_lists: List[Dict[str, Any]], k: int = 60
    ) -> List[Dict[str, Any]]:
        """Merge multiple ranked lists using RRF. k=60 is the standard constant."""
        rrf_scores: Dict[int, float] = {}
        chunk_map: Dict[int, Dict[str, Any]] = {}

        for results in result_lists:
            for rank, item in enumerate(results):
                idx = item["index"]
                rrf_scores[idx] = rrf_scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
                if idx not in chunk_map:
                    chunk_map[idx] = item

        fused = []
        for idx, rrf_score in sorted(
            rrf_scores.items(), key=lambda x: x[1], reverse=True
        ):
            entry = chunk_map[idx].copy()
            entry["score"] = round(rrf_score, 6)
            entry["method"] = "hybrid"
            fused.append(entry)

        return fused

    # ── Embedding management ────────────────────────────────

    def _rebuild_embeddings(self, collection_id: str, chunks: List[str]):
        """Compute and persist embeddings for a collection's chunks."""
        from app.rag.embeddings import embedder

        if not embedder.available or not chunks:
            return

        try:
            embs = embedder.embed(chunks)
            emb_file = self.rag_dir / f"{collection_id}_embeddings.npy"
            np.save(str(emb_file), embs)
            logger.info(
                "Computed %d embeddings for collection %s", len(chunks), collection_id
            )
        except Exception as e:
            logger.warning(f"Failed to compute embeddings: {e}")

    # ── Text splitting ──────────────────────────────────────

    def _recursive_split(self, text: str, chunk_size: int) -> List[str]:
        """Split text by trying separators: \\n\\n, \\n, ' ', then char-level."""
        separators = ["\n\n", "\n", " ", ""]

        def split_text(txt: str, seps: List[str]) -> List[str]:
            if len(txt) <= chunk_size:
                return [txt]

            if not seps or seps[0] == "":
                return [txt[i : i + chunk_size] for i in range(0, len(txt), chunk_size)]

            sep = seps[0]
            parts = txt.split(sep)
            result_chunks: List[str] = []
            current_chunk = ""

            for part in parts:
                candidate_len = len(current_chunk) + len(part) + (
                    len(sep) if current_chunk else 0
                )
                if candidate_len <= chunk_size:
                    current_chunk += (sep if current_chunk else "") + part
                else:
                    if current_chunk:
                        result_chunks.append(current_chunk)
                    if len(part) > chunk_size:
                        result_chunks.extend(split_text(part, seps[1:]))
                        current_chunk = ""
                    else:
                        current_chunk = part

            if current_chunk:
                result_chunks.append(current_chunk)

            return result_chunks

        return split_text(text, separators)

    def _save_collections(self, collections: List[Dict[str, Any]]):
        with open(self.collections_file, "w") as f:
            json.dump(collections, f, indent=2)
