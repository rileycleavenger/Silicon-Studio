"""Tests for the deployment API (start/stop/status/logs)."""

import time
import threading
import io
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from app.api import deployment

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_deployment_state():
    """Reset module-level globals between tests."""
    deployment.server_process = None
    deployment.server_start_time = None
    deployment.server_logs.clear()
    yield
    # Cleanup: kill any subprocess we may have started
    if deployment.server_process is not None:
        try:
            deployment.server_process.kill()
        except Exception:
            pass
    deployment.server_process = None
    deployment.server_start_time = None
    deployment.server_logs.clear()


# ── Status ────────────────────────────────────────────────

def test_status_returns_not_running():
    resp = client.get("/api/deployment/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running"] is False
    assert data["pid"] is None
    assert data["uptime_seconds"] is None


def test_status_returns_running_when_process_alive():
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # still running
    mock_proc.pid = 12345
    deployment.server_process = mock_proc
    deployment.server_start_time = time.time() - 10

    resp = client.get("/api/deployment/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running"] is True
    assert data["pid"] == 12345
    assert data["uptime_seconds"] >= 9


def test_status_cleans_up_crashed_process():
    mock_proc = MagicMock()
    mock_proc.poll.return_value = 1  # exited with error
    deployment.server_process = mock_proc
    deployment.server_start_time = time.time()

    resp = client.get("/api/deployment/status")
    data = resp.json()
    assert data["running"] is False
    assert data["pid"] is None
    # Module-level state should be cleaned up
    assert deployment.server_process is None


# ── Start ─────────────────────────────────────────────────

def test_start_rejects_empty_model_path():
    resp = client.post("/api/deployment/start", json={
        "model_path": "",
        "host": "127.0.0.1",
        "port": 8080,
    })
    assert resp.status_code == 422


def test_start_rejects_whitespace_model_path():
    resp = client.post("/api/deployment/start", json={
        "model_path": "   ",
        "host": "127.0.0.1",
        "port": 8080,
    })
    assert resp.status_code == 422


def test_start_rejects_port_below_1024():
    resp = client.post("/api/deployment/start", json={
        "model_path": "/some/model",
        "host": "127.0.0.1",
        "port": 80,
    })
    assert resp.status_code == 422


def test_start_rejects_port_above_65535():
    resp = client.post("/api/deployment/start", json={
        "model_path": "/some/model",
        "host": "127.0.0.1",
        "port": 70000,
    })
    assert resp.status_code == 422


@patch("app.api.deployment.subprocess.Popen")
def test_start_launches_process(mock_popen):
    mock_proc = MagicMock()
    mock_proc.pid = 42
    mock_proc.poll.return_value = None
    mock_proc.stdout = io.BytesIO(b"")
    mock_proc.stderr = io.BytesIO(b"")
    mock_popen.return_value = mock_proc

    resp = client.post("/api/deployment/start", json={
        "model_path": "/models/llama",
        "host": "127.0.0.1",
        "port": 8080,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["pid"] == 42
    assert "8080" in data["message"]


@patch("app.api.deployment.subprocess.Popen")
def test_start_rejects_duplicate_start(mock_popen):
    # Simulate an already-running process
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None
    deployment.server_process = mock_proc

    resp = client.post("/api/deployment/start", json={
        "model_path": "/models/llama",
        "host": "127.0.0.1",
        "port": 8080,
    })
    assert resp.status_code == 400
    assert "already running" in resp.json()["detail"].lower()


@patch("app.api.deployment.subprocess.Popen", side_effect=FileNotFoundError("python not found"))
def test_start_returns_500_on_popen_failure(mock_popen):
    resp = client.post("/api/deployment/start", json={
        "model_path": "/models/llama",
        "host": "127.0.0.1",
        "port": 8080,
    })
    assert resp.status_code == 500


# ── Stop ──────────────────────────────────────────────────

def test_stop_when_not_running():
    resp = client.post("/api/deployment/stop")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "not running" in data["message"].lower()


def test_stop_terminates_running_process():
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # running
    mock_proc.pid = 99
    mock_proc.wait.return_value = 0
    deployment.server_process = mock_proc
    deployment.server_start_time = time.time()

    resp = client.post("/api/deployment/stop")
    assert resp.status_code == 200
    assert deployment.server_process is None
    assert deployment.server_start_time is None


# ── Logs ──────────────────────────────────────────────────

def test_logs_empty_when_no_server():
    resp = client.get("/api/deployment/logs")
    assert resp.status_code == 200
    assert resp.json()["logs"] == []


def test_logs_returns_all_entries():
    now = time.time()
    deployment.server_logs.append({"timestamp": now, "source": "stdout", "message": "hello"})
    deployment.server_logs.append({"timestamp": now + 1, "source": "stderr", "message": "warn"})

    resp = client.get("/api/deployment/logs")
    logs = resp.json()["logs"]
    assert len(logs) == 2
    assert logs[0]["message"] == "hello"
    assert logs[1]["message"] == "warn"


def test_logs_since_filters_old_entries():
    old_ts = time.time() - 100
    new_ts = time.time()
    deployment.server_logs.append({"timestamp": old_ts, "source": "stdout", "message": "old"})
    deployment.server_logs.append({"timestamp": new_ts, "source": "stdout", "message": "new"})

    resp = client.get(f"/api/deployment/logs?since={old_ts + 1}")
    logs = resp.json()["logs"]
    assert len(logs) == 1
    assert logs[0]["message"] == "new"


def test_logs_ring_buffer_overflow():
    """Ensure deque maxlen is respected (500 entries max)."""
    for i in range(600):
        deployment.server_logs.append({
            "timestamp": time.time(),
            "source": "stdout",
            "message": f"line {i}",
        })
    assert len(deployment.server_logs) == 500
    # Oldest entries should be dropped
    resp = client.get("/api/deployment/logs")
    logs = resp.json()["logs"]
    assert len(logs) == 500
    assert logs[0]["message"] == "line 100"  # first 100 dropped


# ── _read_output helper ──────────────────────────────────

def test_read_output_captures_lines():
    """Test that _read_output reads lines from a pipe into the log buffer."""
    pipe = io.BytesIO(b"line one\nline two\nline three\n")
    deployment._read_output(pipe, "test")

    assert len(deployment.server_logs) == 3
    messages = [e["message"] for e in deployment.server_logs]
    assert messages == ["line one", "line two", "line three"]
    assert all(e["source"] == "test" for e in deployment.server_logs)


def test_read_output_skips_empty_lines():
    pipe = io.BytesIO(b"hello\n\n\nworld\n")
    deployment._read_output(pipe, "out")

    messages = [e["message"] for e in deployment.server_logs]
    assert messages == ["hello", "world"]
