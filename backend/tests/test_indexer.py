"""Tests for the background web indexer."""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.search.indexer import BackgroundIndexer


@pytest.fixture
def indexer(tmp_path):
    """Create an indexer with a temporary workspace directory."""
    idx = BackgroundIndexer()
    idx.workspace_dir = tmp_path
    return idx


def test_add_source(indexer):
    src = indexer.add_source("https://example.com", "Example")
    assert src["url"] == "https://example.com"
    assert src["label"] == "Example"
    assert src["enabled"] is True
    assert "id" in src


def test_add_source_deduplicates(indexer):
    s1 = indexer.add_source("https://example.com", "First")
    s2 = indexer.add_source("https://example.com", "Second")
    assert s1["id"] == s2["id"]
    assert len(indexer.get_sources()) == 1


def test_remove_source(indexer):
    src = indexer.add_source("https://example.com")
    assert len(indexer.get_sources()) == 1
    assert indexer.remove_source(src["id"]) is True
    assert len(indexer.get_sources()) == 0


def test_remove_nonexistent(indexer):
    assert indexer.remove_source("nonexistent") is False


def test_toggle_source(indexer):
    src = indexer.add_source("https://example.com")
    assert indexer.toggle_source(src["id"], False) is True
    sources = indexer.get_sources()
    assert sources[0]["enabled"] is False


def test_toggle_nonexistent(indexer):
    assert indexer.toggle_source("nonexistent", True) is False


def test_get_state_empty(indexer):
    state = indexer.get_state()
    assert state["last_run"] is None
    assert state["collection_id"] is None


def test_sources_persist(indexer):
    indexer.add_source("https://a.com", "A")
    indexer.add_source("https://b.com", "B")

    # Re-read from disk
    idx2 = BackgroundIndexer()
    idx2.workspace_dir = indexer.workspace_dir
    sources = idx2.get_sources()
    assert len(sources) == 2
    assert sources[0]["label"] == "A"
    assert sources[1]["label"] == "B"


def test_add_source_default_label(indexer):
    src = indexer.add_source("https://example.com")
    assert src["label"] == "https://example.com"


def test_is_running_default(indexer):
    assert indexer.is_running is False
