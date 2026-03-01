"""Shared types for the NanoCore agent terminal."""

from enum import Enum
from dataclasses import dataclass, field
from typing import Literal
import time

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    supervisor = "supervisor"
    coder = "coder"
    executor = "executor"


class AgentState(str, Enum):
    thinking = "thinking"
    tool_calling = "tool_calling"
    waiting_human_approval = "waiting_human_approval"
    done = "done"
    error = "error"


SSEEventType = Literal[
    "session_start",
    "token_stream",
    "tool_start",
    "tool_log",
    "tool_done",
    "diff_proposal",
    "telemetry_update",
    "error",
    "done",
]


@dataclass
class TrajectoryEntry:
    timestamp: float = field(default_factory=time.time)
    agent: str = ""
    action: str = ""
    input: str = ""
    output: str = ""
    tokens: int = 0
    duration_ms: float = 0


class TerminalRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=32768)
    model_id: str = Field(min_length=1, max_length=255)
    max_iterations: int = Field(default=10, ge=1, le=50)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class DiffDecision(BaseModel):
    session_id: str = Field(min_length=1)
    call_id: str = Field(min_length=1)
    approved: bool
    reason: str = Field(default="", max_length=1024)
