"""Tests for the engine API (models, finetune, chat, export)."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ── Models ────────────────────────────────────────────────

@patch("app.api.engine.service")
def test_list_models(mock_service):
    mock_service.get_models_status.return_value = [
        {"id": "m1", "name": "Test Model", "size": "4GB", "downloaded": True},
    ]
    resp = client.get("/api/engine/models")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "m1"


@patch("app.api.engine.service")
def test_list_models_empty(mock_service):
    mock_service.get_models_status.return_value = []
    resp = client.get("/api/engine/models")
    assert resp.status_code == 200
    assert resp.json() == []


# ── Model Download ────────────────────────────────────────

@patch("app.api.engine.service")
def test_download_model_starts(mock_service):
    resp = client.post("/api/engine/models/download", json={"model_id": "org/model"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "download_started"
    assert data["model_id"] == "org/model"


# ── Model Delete ──────────────────────────────────────────

@patch("app.api.engine.service")
def test_delete_model_success(mock_service):
    mock_service.delete_model.return_value = True
    resp = client.post("/api/engine/models/delete", json={"model_id": "org/model"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@patch("app.api.engine.service")
def test_delete_model_not_found(mock_service):
    mock_service.delete_model.return_value = False
    resp = client.post("/api/engine/models/delete", json={"model_id": "nonexistent"})
    assert resp.status_code == 404


# ── Model Register ────────────────────────────────────────

@patch("app.api.engine.service")
def test_register_model_success(mock_service):
    mock_service.register_model.return_value = {"id": "/tmp/model", "name": "Custom"}
    resp = client.post("/api/engine/models/register", json={
        "name": "Custom",
        "path": "/tmp/model",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Custom"


@patch("app.api.engine.service")
def test_register_model_bad_path(mock_service):
    mock_service.register_model.side_effect = ValueError("Directory does not exist")
    resp = client.post("/api/engine/models/register", json={
        "name": "Bad",
        "path": "/nonexistent",
    })
    assert resp.status_code == 400


# ── Model Scan ────────────────────────────────────────────

@patch("app.api.engine.service")
def test_scan_models(mock_service):
    mock_service.scan_directory.return_value = [
        {"id": "/tmp/m1", "name": "m1", "path": "/tmp/m1", "size": "2GB"},
    ]
    resp = client.post("/api/engine/models/scan", json={"path": "/tmp"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ── Model Load / Unload ──────────────────────────────────

@patch("app.api.engine.service")
def test_load_model(mock_service):
    mock_service.load_active_model = AsyncMock()
    resp = client.post("/api/engine/models/load", json={"model_id": "test-model"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "loaded"


@patch("app.api.engine.service")
def test_load_model_failure(mock_service):
    mock_service.load_active_model = AsyncMock(side_effect=Exception("Out of memory"))
    resp = client.post("/api/engine/models/load", json={"model_id": "huge-model"})
    assert resp.status_code == 500


@patch("app.api.engine.service")
def test_unload_model(mock_service):
    resp = client.post("/api/engine/models/unload")
    assert resp.status_code == 200
    assert resp.json()["status"] == "unloaded"


@patch("app.api.engine.service")
def test_unload_model_failure(mock_service):
    mock_service.unload_model.side_effect = Exception("cleanup error")
    resp = client.post("/api/engine/models/unload")
    assert resp.status_code == 500


# ── Fine-Tune ─────────────────────────────────────────────

def test_finetune_rejects_zero_epochs():
    resp = client.post("/api/engine/finetune", json={
        "model_id": "test",
        "dataset_path": "/data.jsonl",
        "epochs": 0,
    })
    assert resp.status_code == 422


def test_finetune_rejects_bad_dropout():
    resp = client.post("/api/engine/finetune", json={
        "model_id": "test",
        "dataset_path": "/data.jsonl",
        "lora_dropout": 1.5,
    })
    assert resp.status_code == 422


def test_finetune_rejects_bad_learning_rate():
    resp = client.post("/api/engine/finetune", json={
        "model_id": "test",
        "dataset_path": "/data.jsonl",
        "learning_rate": 0,
    })
    assert resp.status_code == 422


def test_finetune_rejects_bad_batch_size():
    resp = client.post("/api/engine/finetune", json={
        "model_id": "test",
        "dataset_path": "/data.jsonl",
        "batch_size": 0,
    })
    assert resp.status_code == 422


@patch("app.api.engine.service")
def test_finetune_starts_job(mock_service):
    mock_service.start_finetuning = AsyncMock(return_value={
        "job_id": "abc-123",
        "status": "started",
        "job_name": "My Fine-Tune",
    })
    resp = client.post("/api/engine/finetune", json={
        "model_id": "test-model",
        "dataset_path": "/data.jsonl",
        "epochs": 3,
        "job_name": "My Fine-Tune",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "started"
    assert data["job_name"] == "My Fine-Tune"


# ── Job Status ────────────────────────────────────────────

@patch("app.api.engine.service")
def test_job_status_found(mock_service):
    mock_service.get_job_status.return_value = {
        "status": "training",
        "progress": 42,
        "job_id": "abc",
    }
    resp = client.get("/api/engine/jobs/abc")
    assert resp.status_code == 200
    assert resp.json()["progress"] == 42


@patch("app.api.engine.service")
def test_job_status_not_found(mock_service):
    mock_service.get_job_status.return_value = {"status": "not_found"}
    resp = client.get("/api/engine/jobs/nonexistent")
    assert resp.status_code == 404


# ── Chat ──────────────────────────────────────────────────

def test_chat_rejects_bad_temperature():
    resp = client.post("/api/engine/chat", json={
        "model_id": "test",
        "messages": [{"role": "user", "content": "hi"}],
        "temperature": 5.0,
    })
    assert resp.status_code == 422


def test_chat_rejects_bad_max_tokens():
    resp = client.post("/api/engine/chat", json={
        "model_id": "test",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 0,
    })
    assert resp.status_code == 422


def test_chat_rejects_bad_top_p():
    resp = client.post("/api/engine/chat", json={
        "model_id": "test",
        "messages": [{"role": "user", "content": "hi"}],
        "top_p": 2.0,
    })
    assert resp.status_code == 422


@patch("app.api.engine.service")
def test_chat_returns_sse_stream(mock_service):
    async def fake_stream(*args, **kwargs):
        yield {"text": "Hello", "done": False}
        yield {"text": " world", "done": False}
        yield {"text": "", "done": True}

    mock_service.generate_stream = fake_stream
    resp = client.post("/api/engine/chat", json={
        "model_id": "test",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    # Verify SSE data lines are present
    body = resp.text
    assert "data:" in body
    assert "Hello" in body


# ── Chat Stop ─────────────────────────────────────────────

@patch("app.api.engine.service")
def test_stop_generation(mock_service):
    resp = client.post("/api/engine/chat/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"
    mock_service.stop_generation.assert_called_once()


# ── Export ─────────────────────────────────────────────────

def test_export_rejects_bad_qbits():
    resp = client.post("/api/engine/models/export", json={
        "model_id": "test",
        "output_path": "/tmp/out",
        "q_bits": -1,
    })
    assert resp.status_code == 422


def test_export_rejects_qbits_too_high():
    resp = client.post("/api/engine/models/export", json={
        "model_id": "test",
        "output_path": "/tmp/out",
        "q_bits": 17,
    })
    assert resp.status_code == 422


@patch("app.api.engine.service")
def test_export_success(mock_service):
    mock_service.export_model = AsyncMock(return_value={
        "status": "success",
        "path": "/tmp/out",
    })
    resp = client.post("/api/engine/models/export", json={
        "model_id": "ft-abc",
        "output_path": "/tmp/out",
        "q_bits": 4,
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


@patch("app.api.engine.service")
def test_export_failure(mock_service):
    mock_service.export_model = AsyncMock(side_effect=Exception("fuse failed"))
    resp = client.post("/api/engine/models/export", json={
        "model_id": "ft-abc",
        "output_path": "/tmp/out",
        "q_bits": 4,
    })
    assert resp.status_code == 500
