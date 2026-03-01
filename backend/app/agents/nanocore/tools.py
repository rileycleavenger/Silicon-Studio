"""Tool implementations for the NanoCore agent."""

import asyncio
import difflib
import errno
import logging
import os
import pty
import re
import tempfile
from pathlib import Path
from typing import AsyncGenerator

import aiofiles

logger = logging.getLogger(__name__)

# --- ANSI escape code stripper ---
_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')


def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub('', text)


# --- Safety: blocked commands and protected paths ---

BLOCKED_PATTERNS = [
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    ":(){ :|:& };:",
    "> /dev/sda",
    "dd if=/dev/zero of=/dev/",
    "chmod -r 000 /",
    "chown -r",
]

# macOS system paths that should never be touched
PROTECTED_PATHS = [
    "/System", "/Library", "/usr", "/bin", "/sbin",
    "/private", "/etc", "/var", "/cores", "/opt",
    "/Applications",
]

# Commands that require explicit user confirmation (handled via diff approval flow)
DESTRUCTIVE_PREFIXES = [
    "rm ", "rm\t", "rmdir ",
    "sudo ",
    "mv ", "mv\t",
    "chmod ", "chown ",
    "kill ", "killall ",
    "launchctl ",
    "diskutil ",
    "pip uninstall ", "pip3 uninstall ",
    "brew uninstall ", "brew remove ",
]

# Max output bytes per tool call before truncation
MAX_OUTPUT_BYTES = 10 * 1024  # 10 KB


def _is_blocked(command: str) -> str | None:
    """Check if a command should be blocked. Returns reason or None."""
    normalized = command.strip().lower()

    # Absolute block patterns
    for pat in BLOCKED_PATTERNS:
        if pat in normalized:
            return f"Blocked: matches safety rule '{pat}'"

    # Check if command targets protected macOS system paths
    for ppath in PROTECTED_PATHS:
        lower_pp = ppath.lower()
        # Block writes to system paths (rm, mv, cp, chmod, chown, etc.)
        if any(normalized.startswith(prefix) and lower_pp in normalized
               for prefix in ["rm ", "mv ", "cp ", "chmod ", "chown ", "touch ", "mkdir "]):
            return f"Blocked: cannot modify protected system path {ppath}"
        # Block cd + destructive combos
        if f"cd {lower_pp}" in normalized and any(d in normalized for d in ["rm ", "mv ", "chmod "]):
            return f"Blocked: destructive operation in protected path {ppath}"

    return None


def _is_destructive(command: str) -> bool:
    """Check if a command is destructive (needs user awareness, but not blocked)."""
    normalized = command.strip().lower()
    return any(normalized.startswith(p) for p in DESTRUCTIVE_PREFIXES)


async def run_bash(command: str, timeout: int = 60) -> AsyncGenerator[tuple[str, str], None]:
    """Execute a shell command via a PTY, yielding (stream, text) tuples.

    Uses a pseudo-terminal so that programs which check isatty() behave
    normally (colored output, progress bars, Y/n prompts).
    Output is stripped of ANSI codes and capped at MAX_OUTPUT_BYTES.
    """
    block_reason = _is_blocked(command)
    if block_reason:
        yield ("stderr", f"{block_reason}\n")
        return

    if _is_destructive(command):
        yield ("stderr", f"Warning: destructive command detected. Proceeding with caution.\n")

    # Create PTY pair
    master_fd, slave_fd = pty.openpty()

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
        )
    except Exception as e:
        os.close(master_fd)
        os.close(slave_fd)
        yield ("stderr", f"Failed to start process: {e}\n")
        return

    # Close slave in parent — the child process owns it now
    os.close(slave_fd)

    loop = asyncio.get_event_loop()
    total_bytes = 0
    truncated = False

    def _read_master() -> bytes:
        """Blocking read from master fd. Runs in executor."""
        try:
            return os.read(master_fd, 4096)
        except OSError as e:
            # EIO means the slave side closed (process exited on macOS)
            if e.errno == errno.EIO:
                return b""
            raise

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    loop.run_in_executor(None, _read_master),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                yield ("stderr", f"Command timed out after {timeout}s\n")
                proc.kill()
                return
            except OSError:
                # PTY closed unexpectedly
                break

            if not data:
                break

            text = strip_ansi(data.decode(errors="replace"))
            total_bytes += len(text)

            if total_bytes > MAX_OUTPUT_BYTES and not truncated:
                yield ("stderr", f"\n[Output truncated at {MAX_OUTPUT_BYTES // 1024}KB]\n")
                truncated = True
            if not truncated:
                yield ("stdout", text)
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        try:
            await proc.wait()
        except Exception:
            pass


async def generate_edit_diff(file_path: str, new_content: str) -> dict:
    """Generate a unified diff for a file edit without writing to disk.

    Returns {file_path, old, new, diff}. Blocks writes to protected paths.
    Uses aiofiles to avoid blocking the event loop on file reads.
    """
    # Safety: block edits to system paths
    for ppath in PROTECTED_PATHS:
        if file_path.startswith(ppath):
            return {
                "file_path": file_path,
                "old": "",
                "new": "",
                "diff": f"Blocked: cannot edit files in protected path {ppath}",
            }

    p = Path(file_path)
    if p.exists():
        async with aiofiles.open(file_path, mode="r", errors="replace") as f:
            old_content = await f.read()
    else:
        old_content = ""

    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    diff = "".join(difflib.unified_diff(
        old_lines, new_lines,
        fromfile=f"a/{p.name}",
        tofile=f"b/{p.name}",
    ))

    return {
        "file_path": file_path,
        "old": old_content,
        "new": new_content,
        "diff": diff,
    }


async def apply_edit(file_path: str, new_content: str) -> bool:
    """Write new_content to file_path atomically. Only call after human approval.

    Uses a temp file + os.replace for POSIX-atomic writes.
    Runs the blocking I/O in an executor to avoid blocking the event loop.
    """
    # Safety: never write to system paths
    for ppath in PROTECTED_PATHS:
        if file_path.startswith(ppath):
            logger.error(f"Refused to write to protected path: {file_path}")
            return False

    def _write_atomic():
        p = Path(file_path)
        p.parent.mkdir(parents=True, exist_ok=True)

        fd, tmp_path = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
        try:
            os.write(fd, new_content.encode())
            os.close(fd)
            os.replace(tmp_path, file_path)
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

    try:
        await asyncio.to_thread(_write_atomic)
        logger.info(f"Applied edit to {file_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to apply edit to {file_path}: {e}")
        return False
