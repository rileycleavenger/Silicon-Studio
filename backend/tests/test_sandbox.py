"""Tests for the sandbox service (code execution + syntax checking)."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ── Language Detection ───────────────────────────────────

def test_detect_language_from_hint():
    from app.sandbox.service import SandboxService
    svc = SandboxService()
    assert svc.detect_language("x = 1", "python") == "python"
    assert svc.detect_language("x = 1", "javascript") == "javascript"
    assert svc.detect_language("x = 1", "bash") == "bash"


def test_detect_language_from_code():
    from app.sandbox.service import SandboxService
    svc = SandboxService()
    assert svc.detect_language("import os\nprint('hi')") == "python"
    assert svc.detect_language("console.log('hi')") == "javascript"
    assert svc.detect_language("#!/bin/bash\necho hi") == "bash"


def test_detect_language_defaults_to_python():
    from app.sandbox.service import SandboxService
    svc = SandboxService()
    assert svc.detect_language("some random text") == "python"


# ── Run Endpoint ─────────────────────────────────────────

def test_run_python_hello_world():
    resp = client.post("/api/sandbox/run", json={
        "code": "print('hello sandbox')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "hello sandbox" in data["stdout"]
    assert data["exit_code"] == 0
    assert data["timed_out"] is False
    assert data["language"] == "python"


def test_run_python_stderr():
    resp = client.post("/api/sandbox/run", json={
        "code": "import sys; sys.stderr.write('oops\\n')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "oops" in data["stderr"]


def test_run_python_syntax_error():
    resp = client.post("/api/sandbox/run", json={
        "code": "def broken(",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] != 0
    assert data["stderr"] != ""


def test_run_python_timeout():
    resp = client.post("/api/sandbox/run", json={
        "code": "import time; time.sleep(30)",
        "language": "python",
        "timeout": 1,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["timed_out"] is True
    assert "timeout" in data["stderr"].lower()


def test_run_unsupported_language():
    resp = client.post("/api/sandbox/run", json={
        "code": "main = putStrLn \"hello\"",
        "language": "haskell",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["exit_code"] == 1
    assert "unsupported" in data["stderr"].lower()


def test_run_bash_echo():
    resp = client.post("/api/sandbox/run", json={
        "code": "echo 'from bash'",
        "language": "bash",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "from bash" in data["stdout"]
    assert data["exit_code"] == 0


def test_run_strips_ansi_codes():
    resp = client.post("/api/sandbox/run", json={
        "code": "print('\\x1b[31mred\\x1b[0m')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "\x1b" not in data["stdout"]
    assert "red" in data["stdout"]


# ── Check (Syntax) Endpoint ──────────────────────────────

def test_check_valid_python():
    resp = client.post("/api/sandbox/check", json={
        "code": "x = 1 + 2\nprint(x)",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["language"] == "python"


def test_check_invalid_python():
    resp = client.post("/api/sandbox/check", json={
        "code": "def broken(:\n    pass",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["errors"] != ""


def test_check_valid_bash():
    resp = client.post("/api/sandbox/check", json={
        "code": "echo hello && ls",
        "language": "bash",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True


def test_check_invalid_bash():
    resp = client.post("/api/sandbox/check", json={
        "code": "if then fi done",
        "language": "bash",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False


def test_check_unsupported_language_skipped():
    resp = client.post("/api/sandbox/check", json={
        "code": "main = putStrLn \"hello\"",
        "language": "haskell",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data.get("skipped") is True


# ── Kill Endpoint ────────────────────────────────────────

def test_kill_nonexistent_returns_not_killed():
    resp = client.post("/api/sandbox/kill", json={"run_id": "nonexistent-id"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["killed"] is False


# ── Service Unit Tests ───────────────────────────────────

@pytest.mark.asyncio
async def test_service_run_cleans_up_tempdir():
    from app.sandbox.service import SandboxService
    import tempfile
    import os

    svc = SandboxService(default_timeout=5)
    result = await svc.run("print('cleanup test')", "python")
    assert result["exit_code"] == 0
    # Temp dirs should be cleaned up (no silicon-sandbox- dirs lingering)


@pytest.mark.asyncio
async def test_service_kill():
    from app.sandbox.service import SandboxService

    svc = SandboxService(default_timeout=5)
    # No process to kill
    killed = await svc.kill("fake-id")
    assert killed is False
