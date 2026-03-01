import pytest
import os
import json
from app.rag.service import RagService


@pytest.fixture
def rag_service(temp_dir):
    """Create a RagService using a temp directory."""
    svc = RagService()
    # Override paths to use temp dir
    svc.rag_dir = __import__("pathlib").Path(temp_dir)
    svc.collections_file = svc.rag_dir / "collections.json"
    with open(svc.collections_file, "w") as f:
        json.dump([], f)
    return svc


def test_create_collection(rag_service):
    col = rag_service.create_collection("Test")
    assert col["name"] == "Test"
    assert "id" in col
    assert col["chunks"] == 0


def test_list_collections(rag_service):
    rag_service.create_collection("A")
    rag_service.create_collection("B")
    cols = rag_service.get_collections()
    assert len(cols) == 2
    names = {c["name"] for c in cols}
    assert names == {"A", "B"}


def test_delete_collection(rag_service):
    col = rag_service.create_collection("ToDelete")
    assert rag_service.delete_collection(col["id"]) is True
    assert len(rag_service.get_collections()) == 0


def test_delete_nonexistent_collection(rag_service):
    assert rag_service.delete_collection("fake-id") is False


def test_ingest_files(rag_service, temp_text_files):
    col = rag_service.create_collection("Docs")
    result = rag_service.ingest_files(col["id"], temp_text_files, chunk_size=100, overlap=0)
    assert result["chunks"] > 0
    assert result["name"] == "Docs"


def test_ingest_with_overlap(rag_service, temp_text_files):
    col = rag_service.create_collection("Overlap")
    result = rag_service.ingest_files(col["id"], temp_text_files, chunk_size=100, overlap=20)
    assert result["chunks"] > 0


def test_ingest_nonexistent_collection(rag_service, temp_text_files):
    with pytest.raises(ValueError, match="Collection not found"):
        rag_service.ingest_files("fake-id", temp_text_files, 512, 50)


def test_ingest_nonexistent_files(rag_service):
    col = rag_service.create_collection("Empty")
    result = rag_service.ingest_files(col["id"], ["/nonexistent/file.txt"], 512, 0)
    assert result["chunks"] == 0


def test_ingest_directory(rag_service, temp_text_files, temp_dir):
    """Ingesting a directory should recursively process all files in it."""
    col = rag_service.create_collection("DirIngest")
    result = rag_service.ingest_files(col["id"], [temp_dir], chunk_size=200, overlap=0)
    assert result["chunks"] > 0


def test_recursive_split_small_text(rag_service):
    """Text smaller than chunk_size should return as single chunk."""
    result = rag_service._recursive_split("Hello world", chunk_size=100)
    assert result == ["Hello world"]


def test_recursive_split_paragraph_boundaries(rag_service):
    """Should prefer splitting on paragraph boundaries."""
    text = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
    result = rag_service._recursive_split(text, chunk_size=30)
    assert len(result) >= 2
    # Each chunk should be within size limit
    for chunk in result:
        assert len(chunk) <= 30


def test_recursive_split_line_boundaries(rag_service):
    """When paragraphs are too large, should split on newlines."""
    text = "\n".join(f"Line {i} with some content." for i in range(20))
    result = rag_service._recursive_split(text, chunk_size=80)
    assert len(result) > 1
    for chunk in result:
        assert len(chunk) <= 80


def test_recursive_split_word_boundaries(rag_service):
    """When lines are too long, should split on spaces."""
    text = " ".join(["word"] * 200)
    result = rag_service._recursive_split(text, chunk_size=50)
    assert len(result) > 1
    for chunk in result:
        assert len(chunk) <= 50


def test_recursive_split_character_fallback(rag_service):
    """Very long strings without spaces should be split at character level."""
    text = "a" * 500
    result = rag_service._recursive_split(text, chunk_size=100)
    assert len(result) == 5
    for chunk in result:
        assert len(chunk) <= 100


# ── Query / Search tests ────────────────────────────────


def test_query_keyword_fallback(rag_service, temp_text_files):
    """Query should return results using keyword search even without embeddings."""
    col = rag_service.create_collection("Search")
    rag_service.ingest_files(col["id"], temp_text_files, chunk_size=100, overlap=0)
    results = rag_service.query(col["id"], "document", n_results=3)
    assert len(results) > 0
    assert "text" in results[0]
    assert "score" in results[0]
    assert "method" in results[0]


def test_query_empty_collection(rag_service):
    """Query on empty collection should return empty list."""
    col = rag_service.create_collection("Empty")
    results = rag_service.query(col["id"], "anything")
    assert results == []


def test_query_nonexistent_collection(rag_service):
    """Query on non-existent collection should return empty list."""
    results = rag_service.query("nonexistent-id", "anything")
    assert results == []


def test_bm25_search(rag_service):
    """BM25 should rank chunks containing query terms higher."""
    chunks = [
        "The quick brown fox jumps over the lazy dog",
        "Python is a great programming language",
        "The fox is quick and brown",
    ]
    results = rag_service._bm25_search(chunks, "quick brown fox", n=3)
    assert len(results) >= 2
    # First result should be about fox
    assert "fox" in results[0]["text"].lower()


def test_keyword_search_fallback(rag_service):
    """Keyword search should work as BM25 fallback."""
    chunks = [
        "Machine learning is fascinating",
        "Deep learning uses neural networks",
        "Cooking recipes for beginners",
    ]
    results = rag_service._keyword_search(chunks, "learning neural", n=3)
    assert len(results) >= 1
    assert any("learning" in r["text"].lower() for r in results)


def test_reciprocal_rank_fusion(rag_service):
    """RRF should combine results from multiple lists."""
    list1 = [
        {"text": "A", "score": 10, "index": 0, "method": "bm25"},
        {"text": "B", "score": 5, "index": 1, "method": "bm25"},
    ]
    list2 = [
        {"text": "B", "score": 0.9, "index": 1, "method": "vector"},
        {"text": "C", "score": 0.8, "index": 2, "method": "vector"},
    ]
    fused = rag_service._reciprocal_rank_fusion(list1, list2)
    # B appears in both lists, should have highest RRF score
    assert fused[0]["index"] == 1
    assert fused[0]["method"] == "hybrid"


def test_delete_collection_cleans_up_files(rag_service, temp_text_files):
    """Deleting a collection should also remove chunk and embedding files."""
    col = rag_service.create_collection("Cleanup")
    rag_service.ingest_files(col["id"], temp_text_files, chunk_size=100, overlap=0)

    chunks_file = rag_service.rag_dir / f"{col['id']}_chunks.json"
    assert chunks_file.exists()

    rag_service.delete_collection(col["id"])
    assert not chunks_file.exists()
