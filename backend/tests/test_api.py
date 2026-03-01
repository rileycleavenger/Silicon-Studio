import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "silicondev-engine"}


def test_cors_headers():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejected_origin():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_rejects_file_protocol():
    """file:// origins should be rejected (security fix)."""
    response = client.options(
        "/health",
        headers={
            "Origin": "file://",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_monitor_stats():
    response = client.get("/api/monitor/stats")
    assert response.status_code == 200
    data = response.json()
    assert "memory" in data
    assert "cpu" in data
    assert "disk" in data
    assert "platform" in data
    assert data["memory"]["total"] > 0
    assert 0 <= data["cpu"]["percent"] <= 100
    assert data["cpu"]["cores"] > 0


def test_deployment_status_when_stopped():
    response = client.get("/api/deployment/status")
    assert response.status_code == 200
    data = response.json()
    assert data["running"] is False
    assert data["pid"] is None


def test_deployment_start_requires_model_path():
    response = client.post("/api/deployment/start", json={
        "model_path": "",
        "host": "127.0.0.1",
        "port": 8080
    })
    assert response.status_code == 422


def test_deployment_port_validation():
    response = client.post("/api/deployment/start", json={
        "model_path": "/some/model",
        "host": "127.0.0.1",
        "port": 80  # below 1024
    })
    assert response.status_code == 422  # Pydantic validation error


def test_mcp_generation_rejects_unknown_server():
    """MCP generation endpoint rejects unknown server IDs."""
    response = client.post("/api/preparation/generate-mcp", json={
        "model_id": "test",
        "server_id": "nonexistent",
        "prompt": "test",
        "output_path": "/tmp/test.jsonl"
    })
    assert response.status_code == 400


def test_preview_csv_validation():
    response = client.post("/api/preparation/preview", json={
        "file_path": "/nonexistent/file.csv",
        "limit": 5
    })
    assert response.status_code == 400


def test_preview_limit_validation():
    response = client.post("/api/preparation/preview", json={
        "file_path": "/tmp/test.csv",
        "limit": -1
    })
    assert response.status_code == 422  # Pydantic validation


def test_finetune_parameter_validation():
    """Finetune endpoint should validate parameter ranges."""
    response = client.post("/api/engine/finetune", json={
        "model_id": "test-model",
        "dataset_path": "/tmp/data.jsonl",
        "epochs": 0,  # below minimum
    })
    assert response.status_code == 422

    response = client.post("/api/engine/finetune", json={
        "model_id": "test-model",
        "dataset_path": "/tmp/data.jsonl",
        "lora_dropout": 1.5,  # above maximum
    })
    assert response.status_code == 422


def test_chat_parameter_validation():
    """Chat endpoint should validate parameter ranges."""
    response = client.post("/api/engine/chat", json={
        "model_id": "test-model",
        "messages": [{"role": "user", "content": "hi"}],
        "temperature": 5.0,  # above maximum
    })
    assert response.status_code == 422


def test_export_qbits_validation():
    response = client.post("/api/engine/models/export", json={
        "model_id": "test",
        "output_path": "/tmp/out",
        "q_bits": -1  # below minimum
    })
    assert response.status_code == 422


def test_rag_collection_name_validation():
    response = client.post("/api/rag/collections", json={"name": ""})
    assert response.status_code == 422


def test_rag_ingest_chunk_size_validation():
    response = client.post("/api/rag/ingest", json={
        "collection_id": "test",
        "files": ["/tmp/file.txt"],
        "chunk_size": 10,  # below minimum 64
        "overlap": 0
    })
    assert response.status_code == 422


def test_agents_crud():
    """Test agent create, list, delete lifecycle."""
    # Create
    response = client.post("/api/agents/", json={
        "name": "Test Agent",
        "nodes": [{"id": "1", "type": "input"}],
        "edges": []
    })
    assert response.status_code == 200
    agent = response.json()
    assert agent["name"] == "Test Agent"
    assert "id" in agent

    agent_id = agent["id"]

    # List
    response = client.get("/api/agents/")
    assert response.status_code == 200
    agents = response.json()
    assert any(a["id"] == agent_id for a in agents)

    # Execute
    response = client.post(f"/api/agents/{agent_id}/execute", json={"input": "hello"})
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "success"
    assert "execution_time" in result

    # Delete
    response = client.delete(f"/api/agents/{agent_id}")
    assert response.status_code == 200

    # Verify deleted
    response = client.delete(f"/api/agents/{agent_id}")
    assert response.status_code == 404


def test_agent_execute_not_found():
    response = client.post("/api/agents/nonexistent-id/execute", json={"input": "test"})
    assert response.status_code == 404


def test_rag_collection_lifecycle():
    """Test collection create, list, delete."""
    # Create
    response = client.post("/api/rag/collections", json={"name": "Test Collection"})
    assert response.status_code == 200
    col = response.json()
    assert col["name"] == "Test Collection"
    col_id = col["id"]

    # List
    response = client.get("/api/rag/collections")
    assert response.status_code == 200
    cols = response.json()
    assert any(c["id"] == col_id for c in cols)

    # Delete
    response = client.delete(f"/api/rag/collections/{col_id}")
    assert response.status_code == 200

    # Verify deleted
    response = client.delete(f"/api/rag/collections/{col_id}")
    assert response.status_code == 404
