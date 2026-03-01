from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import subprocess
import os
import signal
import time
import logging
import threading
from collections import deque

logger = logging.getLogger(__name__)

router = APIRouter()

# Global state to keep track of the server
server_process = None
server_start_time = None
server_logs: deque = deque(maxlen=500)
_log_lock = threading.Lock()
_log_thread = None


def _read_output(pipe, label: str):
    """Read subprocess output line by line into the ring buffer."""
    try:
        for raw_line in iter(pipe.readline, b''):
            line = raw_line.decode("utf-8", errors="replace").rstrip()
            if line:
                entry = {
                    "timestamp": time.time(),
                    "source": label,
                    "message": line,
                }
                with _log_lock:
                    server_logs.append(entry)
    except Exception:
        pass
    finally:
        pipe.close()

class StartRequest(BaseModel):
    model_path: str = Field(min_length=1, max_length=1024, pattern=r'\S')
    host: str = Field(default="127.0.0.1", max_length=255)
    port: int = Field(default=8080, ge=1024, le=65535)

@router.post("/start")
async def start_server(req: StartRequest):
    global server_process, server_start_time
    if server_process is not None and server_process.poll() is None:
        raise HTTPException(status_code=400, detail="Server is already running.")

    cmd = [
        "python", "-m", "mlx_lm.server",
        "--model", req.model_path,
        "--host", req.host,
        "--port", str(req.port)
    ]

    try:
        server_logs.clear()
        server_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid if os.name == 'posix' else None
        )
        server_start_time = time.time()

        # Start background threads to read stdout/stderr into the log buffer
        for pipe, label in [(server_process.stdout, "stdout"), (server_process.stderr, "stderr")]:
            t = threading.Thread(target=_read_output, args=(pipe, label), daemon=True)
            t.start()

        logger.info(f"Deployment server started on {req.host}:{req.port} (PID {server_process.pid})")

        return {"status": "success", "message": f"API Server started on {req.host}:{req.port}", "pid": server_process.pid}
    except Exception as e:
        logger.error(f"Failed to start deployment server: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop")
async def stop_server():
    global server_process, server_start_time
    if server_process is None or server_process.poll() is not None:
        server_process = None
        server_start_time = None
        return {"status": "success", "message": "Server is not running."}

    try:
        if os.name == 'posix':
            os.killpg(os.getpgid(server_process.pid), signal.SIGTERM)
        else:
            server_process.terminate()

        server_process.wait(timeout=5)
    except Exception:
        if server_process:
            server_process.kill()

    logger.info("Deployment server stopped.")
    server_process = None
    server_start_time = None
    return {"status": "success", "message": "API Server stopped."}

@router.get("/status")
async def get_status():
    global server_process, server_start_time
    is_running = server_process is not None and server_process.poll() is None

    # Clean up state if process crashed
    if server_process is not None and not is_running:
        server_process = None
        server_start_time = None

    uptime = None
    if is_running and server_start_time:
        uptime = round(time.time() - server_start_time)

    return {
        "running": is_running,
        "pid": server_process.pid if is_running else None,
        "uptime_seconds": uptime,
    }


@router.get("/logs")
async def get_logs(since: float = 0):
    """Return log entries newer than `since` (unix timestamp)."""
    with _log_lock:
        entries = [e for e in server_logs if e["timestamp"] > since]
    return {"logs": entries}
