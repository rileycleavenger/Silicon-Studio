import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

BASE = "/api/conversations"


def test_create_conversation():
    response = client.post(BASE + "/", json={
        "title": "Test Conversation",
        "messages": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ],
        "model_id": "test-model",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Conversation"
    assert data["message_count"] == 2
    assert data["model_id"] == "test-model"
    assert "id" in data
    assert "created_at" in data
    assert data["pinned"] is False

    # Cleanup
    client.delete(f"{BASE}/{data['id']}")


def test_create_conversation_defaults():
    """Creating with no body should use defaults."""
    response = client.post(BASE + "/", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New conversation"
    assert data["message_count"] == 0
    assert data["messages"] == []

    # Cleanup
    client.delete(f"{BASE}/{data['id']}")


def test_conversation_lifecycle():
    """Test full CRUD: create, get, update, list, delete."""
    # Create
    resp = client.post(BASE + "/", json={"title": "Lifecycle Test"})
    assert resp.status_code == 200
    conv = resp.json()
    conv_id = conv["id"]

    # Get
    resp = client.get(f"{BASE}/{conv_id}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Lifecycle Test"

    # Update title
    resp = client.patch(f"{BASE}/{conv_id}", json={"title": "Updated Title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"

    # Update messages
    resp = client.patch(f"{BASE}/{conv_id}", json={
        "messages": [{"role": "user", "content": "new msg"}]
    })
    assert resp.status_code == 200
    assert resp.json()["message_count"] == 1

    # List — should contain our conversation
    resp = client.get(BASE + "/")
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert conv_id in ids

    # Delete
    resp = client.delete(f"{BASE}/{conv_id}")
    assert resp.status_code == 200

    # Verify deleted
    resp = client.get(f"{BASE}/{conv_id}")
    assert resp.status_code == 404


def test_get_nonexistent_conversation():
    resp = client.get(f"{BASE}/nonexistent-id")
    assert resp.status_code == 404


def test_update_nonexistent_conversation():
    resp = client.patch(f"{BASE}/nonexistent-id", json={"title": "x"})
    assert resp.status_code == 404


def test_delete_nonexistent_conversation():
    resp = client.delete(f"{BASE}/nonexistent-id")
    assert resp.status_code == 404


def test_pin_conversation():
    """Test pinning and unpinning a conversation."""
    resp = client.post(BASE + "/", json={"title": "Pin Test"})
    conv_id = resp.json()["id"]

    # Pin
    resp = client.patch(f"{BASE}/{conv_id}", json={"pinned": True})
    assert resp.status_code == 200
    assert resp.json()["pinned"] is True

    # Unpin
    resp = client.patch(f"{BASE}/{conv_id}", json={"pinned": False})
    assert resp.status_code == 200
    assert resp.json()["pinned"] is False

    # Cleanup
    client.delete(f"{BASE}/{conv_id}")


def test_pinned_conversations_sort_first():
    """Pinned conversations should appear before unpinned ones."""
    resp1 = client.post(BASE + "/", json={"title": "Unpinned"})
    resp2 = client.post(BASE + "/", json={"title": "Pinned"})
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]

    # Pin the second one
    client.patch(f"{BASE}/{id2}", json={"pinned": True})

    # List
    resp = client.get(BASE + "/")
    convs = resp.json()
    pinned_ids = [c["id"] for c in convs if c.get("pinned")]
    unpinned_ids = [c["id"] for c in convs if not c.get("pinned")]

    # All pinned should appear before all unpinned in the list
    if pinned_ids and unpinned_ids:
        pinned_positions = [i for i, c in enumerate(convs) if c.get("pinned")]
        unpinned_positions = [i for i, c in enumerate(convs) if not c.get("pinned")]
        assert max(pinned_positions) < min(unpinned_positions)

    # Cleanup
    client.delete(f"{BASE}/{id1}")
    client.delete(f"{BASE}/{id2}")


def test_search_conversations_by_title():
    resp = client.post(BASE + "/", json={"title": "UniqueSearchTitle42"})
    conv_id = resp.json()["id"]

    resp = client.post(BASE + "/search", json={"q": "UniqueSearchTitle42"})
    assert resp.status_code == 200
    results = resp.json()
    assert any(r["id"] == conv_id for r in results)

    # Cleanup
    client.delete(f"{BASE}/{conv_id}")


def test_search_conversations_by_content():
    resp = client.post(BASE + "/", json={
        "title": "Content Search Test",
        "messages": [{"role": "user", "content": "SuperUniquePhrase789"}]
    })
    conv_id = resp.json()["id"]

    resp = client.post(BASE + "/search", json={"q": "SuperUniquePhrase789"})
    assert resp.status_code == 200
    results = resp.json()
    assert any(r["id"] == conv_id for r in results)
    # Should have a match_context snippet
    match = next(r for r in results if r["id"] == conv_id)
    assert "SuperUniquePhrase789" in match.get("match_context", "")

    # Cleanup
    client.delete(f"{BASE}/{conv_id}")


def test_search_empty_query_rejected():
    resp = client.post(BASE + "/search", json={"q": ""})
    assert resp.status_code == 422


def test_search_no_results():
    resp = client.post(BASE + "/search", json={"q": "zzzNonExistentQuery999"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_branch_conversation():
    """Test branching from a specific message index."""
    resp = client.post(BASE + "/", json={
        "title": "Branch Source",
        "messages": [
            {"role": "user", "content": "msg 0"},
            {"role": "assistant", "content": "msg 1"},
            {"role": "user", "content": "msg 2"},
            {"role": "assistant", "content": "msg 3"},
        ]
    })
    source_id = resp.json()["id"]

    # Branch from message index 1 (should include messages 0 and 1)
    resp = client.post(f"{BASE}/{source_id}/branch", json={"message_index": 1})
    assert resp.status_code == 200
    branch = resp.json()
    assert branch["title"] == "Branch Source (branch)"
    assert branch["message_count"] == 2
    assert len(branch["messages"]) == 2
    assert branch["messages"][0]["content"] == "msg 0"
    assert branch["messages"][1]["content"] == "msg 1"
    assert branch["branched_from"]["conversation_id"] == source_id
    assert branch["branched_from"]["message_index"] == 1
    assert branch["id"] != source_id

    # Cleanup
    client.delete(f"{BASE}/{source_id}")
    client.delete(f"{BASE}/{branch['id']}")


def test_branch_nonexistent_conversation():
    resp = client.post(f"{BASE}/nonexistent-id/branch", json={"message_index": 0})
    assert resp.status_code == 404


def test_branch_invalid_message_index():
    resp = client.post(BASE + "/", json={
        "title": "Branch Index Test",
        "messages": [{"role": "user", "content": "only one"}]
    })
    source_id = resp.json()["id"]

    # Index 5 is out of range (only 1 message)
    resp = client.post(f"{BASE}/{source_id}/branch", json={"message_index": 5})
    assert resp.status_code == 404

    # Cleanup
    client.delete(f"{BASE}/{source_id}")


def test_branch_negative_index_rejected():
    """Pydantic should reject negative message_index."""
    resp = client.post(BASE + "/", json={
        "title": "Negative Index Test",
        "messages": [{"role": "user", "content": "msg"}]
    })
    source_id = resp.json()["id"]

    resp = client.post(f"{BASE}/{source_id}/branch", json={"message_index": -1})
    assert resp.status_code == 422

    # Cleanup
    client.delete(f"{BASE}/{source_id}")


def test_branch_appears_in_list():
    """A branched conversation should appear in the list with branched_from metadata."""
    resp = client.post(BASE + "/", json={
        "title": "List Branch Test",
        "messages": [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
    })
    source_id = resp.json()["id"]

    resp = client.post(f"{BASE}/{source_id}/branch", json={"message_index": 0})
    branch_id = resp.json()["id"]

    resp = client.get(BASE + "/")
    convs = resp.json()
    branch_summary = next((c for c in convs if c["id"] == branch_id), None)
    assert branch_summary is not None
    assert "branched_from" in branch_summary
    assert branch_summary["branched_from"]["conversation_id"] == source_id

    # Cleanup
    client.delete(f"{BASE}/{source_id}")
    client.delete(f"{BASE}/{branch_id}")
