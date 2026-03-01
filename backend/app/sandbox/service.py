import asyncio
import re
import shutil
import tempfile
import time
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Strip ANSI escape sequences (colors, cursor movement, etc.)
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")

# Language configs: (file extension, command builder)
LANGUAGE_CONFIG: dict[str, tuple[str, object]] = {
    "python": (".py", lambda path: ["python3", str(path)]),
    "javascript": (".js", lambda path: ["node", str(path)]),
    "js": (".js", lambda path: ["node", str(path)]),
    "typescript": (".ts", lambda path: ["npx", "tsx", str(path)]),
    "ts": (".ts", lambda path: ["npx", "tsx", str(path)]),
    "bash": (".sh", lambda path: ["bash", str(path)]),
    "sh": (".sh", lambda path: ["bash", str(path)]),
    "shell": (".sh", lambda path: ["bash", str(path)]),
    "zsh": (".sh", lambda path: ["zsh", str(path)]),
    "ruby": (".rb", lambda path: ["ruby", str(path)]),
    "php": (".php", lambda path: ["php", str(path)]),
    "perl": (".pl", lambda path: ["perl", str(path)]),
    "swift": (".swift", lambda path: ["swift", str(path)]),
}

# Syntax-check-only commands per language
# Each returns (file extension, command builder) where exit 0 = valid syntax
SYNTAX_CHECK_CONFIG: dict[str, tuple[str, object]] = {
    "python": (".py", lambda path: ["python3", "-m", "py_compile", str(path)]),
    "javascript": (".js", lambda path: ["node", "--check", str(path)]),
    "js": (".js", lambda path: ["node", "--check", str(path)]),
    "typescript": (".ts", lambda path: ["npx", "tsc", "--noEmit", "--allowJs", str(path)]),
    "ts": (".ts", lambda path: ["npx", "tsc", "--noEmit", "--allowJs", str(path)]),
    "bash": (".sh", lambda path: ["bash", "-n", str(path)]),
    "sh": (".sh", lambda path: ["bash", "-n", str(path)]),
    "shell": (".sh", lambda path: ["bash", "-n", str(path)]),
    "zsh": (".sh", lambda path: ["zsh", "-n", str(path)]),
    "ruby": (".rb", lambda path: ["ruby", "-c", str(path)]),
    "php": (".php", lambda path: ["php", "-l", str(path)]),
    "perl": (".pl", lambda path: ["perl", "-c", str(path)]),
    "swift": (".swift", lambda path: ["swift", "-parse", str(path)]),
}

# Max output size to prevent memory issues (256KB)
MAX_OUTPUT_BYTES = 256 * 1024


class SandboxService:
    def __init__(self, default_timeout: int = 10):
        self.default_timeout = default_timeout
        self._running_processes: dict[str, asyncio.subprocess.Process] = {}

    def detect_language(self, code: str, hint: str = "") -> str:
        """Best-effort language detection from hint or code content."""
        hint = hint.strip().lower()
        if hint in LANGUAGE_CONFIG:
            return hint
        # Heuristics
        if "def " in code or "import " in code or "print(" in code:
            return "python"
        if "console.log" in code or "const " in code or "function " in code:
            return "javascript"
        if "#!/bin/bash" in code or "#!/bin/sh" in code or code.startswith("echo "):
            return "bash"
        return hint or "python"

    async def run(
        self,
        code: str,
        language: str = "",
        timeout: Optional[int] = None,
        run_id: Optional[str] = None,
    ) -> dict:
        lang = self.detect_language(code, language)
        config = LANGUAGE_CONFIG.get(lang)
        if not config:
            return {
                "stdout": "",
                "stderr": f"Unsupported language: {lang}",
                "exit_code": 1,
                "execution_time": 0,
                "language": lang,
                "timed_out": False,
            }

        ext, cmd_builder = config
        runtime = cmd_builder(Path("/dev/null"))[0]
        if not shutil.which(runtime):
            return {
                "stdout": "",
                "stderr": f"Runtime not found: {runtime}. Install it to run {lang} code.",
                "exit_code": 1,
                "execution_time": 0,
                "language": lang,
                "timed_out": False,
            }

        timeout = timeout or self.default_timeout
        tmpdir = tempfile.mkdtemp(prefix="silicon-sandbox-")
        script_path = Path(tmpdir) / f"script{ext}"

        try:
            script_path.write_text(code, encoding="utf-8")
            cmd = cmd_builder(script_path)

            start = time.monotonic()
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir,
            )

            if run_id:
                self._running_processes[run_id] = process

            timed_out = False
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                timed_out = True
                process.kill()
                stdout_bytes, stderr_bytes = await process.communicate()

            elapsed = round(time.monotonic() - start, 3)

            stdout = _ANSI_RE.sub("", stdout_bytes[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace"))
            stderr = _ANSI_RE.sub("", stderr_bytes[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace"))
            if timed_out:
                stderr += f"\n[Killed: exceeded {timeout}s timeout]"

            return {
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": (process.returncode or -1) if timed_out else process.returncode,
                "execution_time": elapsed,
                "language": lang,
                "timed_out": timed_out,
            }

        except Exception as e:
            logger.error(f"Sandbox execution error: {e}")
            return {
                "stdout": "",
                "stderr": str(e),
                "exit_code": 1,
                "execution_time": 0,
                "language": lang,
                "timed_out": False,
            }
        finally:
            if run_id:
                self._running_processes.pop(run_id, None)
            # Clean up temp dir
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass

    async def check(self, code: str, language: str = "") -> dict:
        """Run syntax-only validation. Returns {valid, errors, language}."""
        lang = self.detect_language(code, language)
        config = SYNTAX_CHECK_CONFIG.get(lang)
        if not config:
            return {"valid": True, "errors": "", "language": lang, "skipped": True}

        ext, cmd_builder = config
        # Check runtime availability
        runtime = cmd_builder(Path("/dev/null"))[0]
        if not shutil.which(runtime):
            return {"valid": True, "errors": "", "language": lang, "skipped": True}

        tmpdir = tempfile.mkdtemp(prefix="silicon-check-")
        script_path = Path(tmpdir) / f"check{ext}"
        try:
            script_path.write_text(code, encoding="utf-8")
            cmd = cmd_builder(script_path)
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(), timeout=15
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                return {"valid": True, "errors": "", "language": lang, "skipped": True}

            errors = _ANSI_RE.sub("", stderr_bytes[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")).strip()
            # Some tools (ruby -c, php -l) output success info to stdout — only report stderr on failure
            if process.returncode != 0 and not errors:
                errors = _ANSI_RE.sub("", stdout_bytes[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")).strip()

            return {
                "valid": process.returncode == 0,
                "errors": errors if process.returncode != 0 else "",
                "language": lang,
                "skipped": False,
            }
        except Exception as e:
            logger.error(f"Syntax check error: {e}")
            return {"valid": True, "errors": "", "language": lang, "skipped": True}
        finally:
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass

    async def kill(self, run_id: str) -> bool:
        process = self._running_processes.get(run_id)
        if process and process.returncode is None:
            process.kill()
            return True
        return False
