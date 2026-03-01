"""API endpoints for the NanoCore agent terminal."""

import json
import uuid
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.nanocore.types import TerminalRequest, DiffDecision
from app.agents.nanocore.supervisor import SupervisorAgent

logger = logging.getLogger(__name__)

router = APIRouter()

# Active sessions keyed by session_id
_active_sessions: dict[str, SupervisorAgent] = {}


@router.post("/run")
async def run_terminal(request: TerminalRequest):
    """Start an agent session. Returns an SSE stream of events."""
    session_id = str(uuid.uuid4())

    agent = SupervisorAgent(
        session_id=session_id,
        model_id=request.model_id,
        max_iterations=request.max_iterations,
        temperature=request.temperature,
    )
    _active_sessions[session_id] = agent

    async def event_generator():
        try:
            async for event in agent.run(request.prompt):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.error(f"Terminal session error: {e}")
            yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(e)}})}\n\n"
        finally:
            # Cleanup: stop agent and remove from active sessions
            agent.stop()
            _active_sessions.pop(session_id, None)
            logger.info(f"Terminal session {session_id} cleaned up")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/diff/decide")
async def decide_diff(decision: DiffDecision):
    """Approve or reject a pending diff proposal."""
    agent = _active_sessions.get(decision.session_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Session not found")

    ok = agent.resolve_diff(decision.call_id, decision.approved, decision.reason)
    if not ok:
        raise HTTPException(status_code=404, detail="Diff not found or already resolved")

    return {"status": "resolved", "approved": decision.approved}


@router.post("/stop")
async def stop_terminal(body: dict = {}):
    """Stop a running agent session."""
    session_id = body.get("session_id", "")
    agent = _active_sessions.get(session_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Session not found")

    agent.stop()
    return {"status": "stopping"}
