"""Supervisor agent — orchestrates the tool-use loop and yields SSE events."""

import asyncio
import logging
import re
import time
import uuid
from typing import AsyncGenerator

from .types import AgentState, TrajectoryEntry
from .prompts import SYSTEM_PROMPT
from .parser import extract_tool_calls, has_partial_tool_tag, strip_tool_calls
from .tools import run_bash, generate_edit_diff, apply_edit

logger = logging.getLogger(__name__)

# Strip <think>...</think> blocks and any leftover tags from model output
_THINK_RE = re.compile(r'<think>.*?</think>', re.DOTALL)
_THINK_OPEN_RE = re.compile(r'</?think[^>]*>')

# Max chars of tool output to inject back into the conversation
MAX_TOOL_OUTPUT_CHARS = 4000


def _strip_think_tags(text: str) -> str:
    """Remove <think>...</think> blocks and stray tags from model output."""
    text = _THINK_RE.sub('', text)
    text = _THINK_OPEN_RE.sub('', text)
    return text.strip()


def _truncate(text: str, max_chars: int = MAX_TOOL_OUTPUT_CHARS) -> str:
    """Truncate text, adding a marker if truncated."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"\n[...truncated, {len(text) - max_chars} chars omitted]"


def _sse(event: str, data: dict) -> dict:
    """Wrap an event into the SSE envelope format."""
    return {"event": event, "data": data}


class SupervisorAgent:
    """Runs a multi-turn agent loop, yielding SSE-formatted dicts."""

    def __init__(self, session_id: str, model_id: str, max_iterations: int = 10, temperature: float = 0.7):
        self.session_id = session_id
        self.model_id = model_id
        self.max_iterations = max_iterations
        self.temperature = temperature

        self._state = AgentState.thinking
        self._stopped = False
        self._pending_diffs: dict[str, dict] = {}  # call_id -> {event, approved, diff_info}
        self._trajectory: list[TrajectoryEntry] = []
        self._total_tokens = 0
        self._start_time = 0.0

    def stop(self):
        """Signal the agent to stop after current iteration."""
        self._stopped = True
        # Also stop any active MLX generation
        try:
            from app.api.engine import service as engine_service
            engine_service.stop_generation()
        except Exception:
            pass

    def resolve_diff(self, call_id: str, approved: bool, reason: str = "") -> bool:
        """Resolve a pending diff decision. Returns False if call_id not found."""
        pending = self._pending_diffs.get(call_id)
        if not pending:
            return False
        pending["approved"] = approved
        pending["reason"] = reason
        pending["event"].set()
        return True

    async def run(self, prompt: str) -> AsyncGenerator[dict, None]:
        """Main agent loop. Yields SSE event dicts."""
        # Lazy import to avoid circular imports at module level
        from app.api.engine import service as engine_service

        self._start_time = time.time()
        yield _sse("session_start", {"session_id": self.session_id})

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        iteration = 0
        for iteration in range(1, self.max_iterations + 1):
            if self._stopped:
                break

            self._state = AgentState.thinking
            yield _sse("telemetry_update", {
                "agent": "supervisor",
                "state": self._state.value,
                "tokens_used": self._total_tokens,
                "elapsed_ms": (time.time() - self._start_time) * 1000,
                "iteration": iteration,
            })

            # --- Generate from model ---
            accumulated = ""
            streamed_up_to = 0
            iter_tokens = 0
            in_think_block = False
            think_buffer = ""

            try:
                async for chunk in engine_service.generate_stream(
                    self.model_id,
                    messages,
                    temperature=self.temperature,
                    max_tokens=2048,
                ):
                    if self._stopped:
                        engine_service.stop_generation()
                        break
                    if "error" in chunk:
                        yield _sse("error", {"message": chunk["error"]})
                        return
                    if "text" in chunk:
                        token_text = chunk["text"]
                        accumulated += token_text
                        iter_tokens += 1

                        # Handle <think> blocks: buffer them and don't stream
                        if in_think_block:
                            think_buffer += token_text
                            if "</think>" in think_buffer:
                                in_think_block = False
                                # Resume streaming from after the think block
                                streamed_up_to = len(accumulated)
                                think_buffer = ""
                            continue

                        if "<think>" in accumulated[streamed_up_to:]:
                            in_think_block = True
                            # Stream everything before <think>
                            before_think = accumulated[streamed_up_to:].split("<think>")[0]
                            if before_think:
                                yield _sse("token_stream", {"agent": "supervisor", "text": before_think})
                            streamed_up_to = len(accumulated)
                            think_buffer = token_text
                            continue

                        # Stream text but suppress partial tool tags
                        if not has_partial_tool_tag(accumulated):
                            new_text = accumulated[streamed_up_to:]
                            if new_text:
                                yield _sse("token_stream", {"agent": "supervisor", "text": new_text})
                                streamed_up_to = len(accumulated)
            except Exception as e:
                yield _sse("error", {"message": str(e)})
                return

            self._total_tokens += iter_tokens

            # Clean the accumulated text: remove think blocks before parsing
            cleaned = _strip_think_tags(accumulated)

            # --- Parse tool calls ---
            tool_calls = extract_tool_calls(cleaned)

            if not tool_calls:
                # No tool calls — agent is done
                # Stream any remaining cleaned text
                clean_remaining = _strip_think_tags(accumulated[streamed_up_to:])
                if clean_remaining:
                    yield _sse("token_stream", {"agent": "supervisor", "text": clean_remaining})
                break

            # --- Execute tool calls ---
            self._state = AgentState.tool_calling
            tool_results = []

            for tc in tool_calls:
                if self._stopped:
                    break

                call_id = str(uuid.uuid4())[:8]

                if tc.name == "run_bash":
                    command = tc.args.get("command", "")
                    yield _sse("tool_start", {"tool": "run_bash", "args": {"command": command}, "call_id": call_id})

                    output_lines = []
                    exit_code = 0
                    async for stream, text in run_bash(command):
                        yield _sse("tool_log", {"call_id": call_id, "stream": stream, "text": text})
                        output_lines.append(text)
                        if stream == "stderr" and "Blocked:" in text:
                            exit_code = 1

                    yield _sse("tool_done", {"call_id": call_id, "exit_code": exit_code})

                    raw_output = "".join(output_lines)
                    tool_results.append(f"[bash output]\n{_truncate(raw_output)}")

                    self._trajectory.append(TrajectoryEntry(
                        agent="supervisor", action="run_bash",
                        input=command, output=raw_output[:500],
                        tokens=iter_tokens,
                    ))

                elif tc.name == "edit_file":
                    file_path = tc.args.get("path", "")
                    new_content = tc.args.get("content", "")

                    diff_info = await generate_edit_diff(file_path, new_content)

                    # Check if blocked
                    if diff_info["diff"].startswith("Blocked:"):
                        yield _sse("error", {"message": diff_info["diff"]})
                        tool_results.append(f"[edit_file] {diff_info['diff']}")
                        continue

                    yield _sse("diff_proposal", {
                        "call_id": call_id,
                        "file_path": diff_info["file_path"],
                        "old": diff_info["old"],
                        "new": diff_info["new"],
                        "diff": diff_info["diff"],
                    })

                    # Wait for human decision
                    self._state = AgentState.waiting_human_approval
                    yield _sse("telemetry_update", {
                        "agent": "supervisor",
                        "state": self._state.value,
                        "tokens_used": self._total_tokens,
                        "elapsed_ms": (time.time() - self._start_time) * 1000,
                        "iteration": iteration,
                    })

                    event = asyncio.Event()
                    self._pending_diffs[call_id] = {
                        "event": event,
                        "approved": False,
                        "diff_info": diff_info,
                    }

                    # Send periodic heartbeats while waiting
                    while not event.is_set():
                        if self._stopped:
                            break
                        try:
                            await asyncio.wait_for(event.wait(), timeout=5.0)
                        except asyncio.TimeoutError:
                            yield _sse("telemetry_update", {
                                "agent": "supervisor",
                                "state": self._state.value,
                                "tokens_used": self._total_tokens,
                                "elapsed_ms": (time.time() - self._start_time) * 1000,
                                "iteration": iteration,
                            })

                    if self._stopped:
                        tool_results.append(f"[edit_file] Session stopped")
                        break

                    approved = self._pending_diffs[call_id]["approved"]
                    reject_reason = self._pending_diffs[call_id].get("reason", "")
                    del self._pending_diffs[call_id]

                    if approved:
                        await apply_edit(file_path, new_content)
                        tool_results.append(f"[edit_file] Applied changes to {file_path}")
                    else:
                        msg = f"[edit_file] User rejected changes to {file_path}"
                        if reject_reason:
                            msg += f" — reason: {reject_reason}"
                        tool_results.append(msg)

                    self._trajectory.append(TrajectoryEntry(
                        agent="supervisor", action="edit_file",
                        input=file_path,
                        output="approved" if approved else "rejected",
                    ))

                else:
                    tool_results.append(f"[unknown tool: {tc.name}]")

            # Append assistant message (cleaned) and tool results to conversation
            messages.append({"role": "assistant", "content": cleaned})
            messages.append({
                "role": "user",
                "content": "Tool results:\n" + "\n---\n".join(tool_results),
            })

        # --- Done ---
        self._state = AgentState.done
        elapsed_ms = (time.time() - self._start_time) * 1000
        yield _sse("done", {
            "summary": f"Completed in {iteration} iteration(s)",
            "total_tokens": self._total_tokens,
            "total_time_ms": round(elapsed_ms),
        })
