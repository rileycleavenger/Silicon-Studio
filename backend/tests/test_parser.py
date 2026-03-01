"""Tests for the NanoCore XML tool call parser and safety tools."""

from app.agents.nanocore.parser import extract_tool_calls, has_partial_tool_tag, strip_tool_calls
from app.agents.nanocore.tools import strip_ansi, _is_blocked, _is_destructive
from app.agents.nanocore.supervisor import _strip_think_tags, _truncate


def test_single_tool_call():
    text = 'Let me check.\n<tool name="run_bash"><arg name="command">ls -la</arg></tool>'
    calls = extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0].name == "run_bash"
    assert calls[0].args["command"] == "ls -la"


def test_multiple_tool_calls():
    text = (
        '<tool name="run_bash"><arg name="command">pwd</arg></tool>\n'
        'Now editing:\n'
        '<tool name="edit_file"><arg name="path">/tmp/x.py</arg><arg name="content">print(1)</arg></tool>'
    )
    calls = extract_tool_calls(text)
    assert len(calls) == 2
    assert calls[0].name == "run_bash"
    assert calls[1].name == "edit_file"
    assert calls[1].args["path"] == "/tmp/x.py"
    assert calls[1].args["content"] == "print(1)"


def test_no_tool_calls():
    text = "I think we should refactor the code."
    calls = extract_tool_calls(text)
    assert len(calls) == 0


def test_multiline_content_arg():
    text = '<tool name="edit_file"><arg name="path">/tmp/f.py</arg><arg name="content">\ndef hello():\n    return "world"\n</arg></tool>'
    calls = extract_tool_calls(text)
    assert len(calls) == 1
    assert "def hello():" in calls[0].args["content"]


def test_partial_tool_tag_detected():
    text = 'Let me run <tool name="run_bash"><arg name="command">ls'
    assert has_partial_tool_tag(text) is True


def test_complete_tool_not_partial():
    text = '<tool name="run_bash"><arg name="command">ls</arg></tool>'
    assert has_partial_tool_tag(text) is False


def test_no_tool_tag_not_partial():
    text = "Just regular text with no XML."
    assert has_partial_tool_tag(text) is False


def test_strip_tool_calls():
    text = 'Before\n<tool name="run_bash"><arg name="command">ls</arg></tool>\nAfter'
    stripped = strip_tool_calls(text)
    assert "Before" in stripped
    assert "After" in stripped
    assert "<tool" not in stripped


def test_malformed_tool_ignored():
    text = '<tool name="run_bash">no args here, missing closing'
    calls = extract_tool_calls(text)
    assert len(calls) == 0


def test_empty_command():
    text = '<tool name="run_bash"><arg name="command"></arg></tool>'
    calls = extract_tool_calls(text)
    assert len(calls) == 1
    assert calls[0].args["command"] == ""


# --- ANSI stripping ---

def test_strip_ansi_codes():
    assert strip_ansi("\x1b[32mgreen\x1b[0m") == "green"
    assert strip_ansi("no codes here") == "no codes here"
    assert strip_ansi("\x1b[1;31mred bold\x1b[0m text") == "red bold text"


# --- Safety: blocked commands ---

def test_blocked_rm_rf_root():
    assert _is_blocked("rm -rf /") is not None
    assert _is_blocked("RM -RF /") is not None

def test_blocked_system_path():
    assert _is_blocked("rm /System/Library/foo") is not None
    assert _is_blocked("chmod 777 /usr/bin/python") is not None

def test_allowed_normal_command():
    assert _is_blocked("ls -la") is None
    assert _is_blocked("cat /tmp/test.py") is None
    assert _is_blocked("rm /tmp/testfile.txt") is None

def test_destructive_detection():
    assert _is_destructive("rm file.txt") is True
    assert _is_destructive("sudo apt update") is True
    assert _is_destructive("ls -la") is False
    assert _is_destructive("cat file.py") is False


# --- Think tag stripping ---

def test_strip_think_tags():
    text = "<think>internal reasoning</think>Hello world"
    assert _strip_think_tags(text) == "Hello world"

def test_strip_think_multiline():
    text = "<think>\nstep 1\nstep 2\n</think>\nResult here"
    assert _strip_think_tags(text) == "Result here"

def test_strip_think_no_tags():
    text = "No think tags here"
    assert _strip_think_tags(text) == "No think tags here"

def test_strip_orphan_think_tag():
    text = "text <think> leftover"
    result = _strip_think_tags(text)
    assert "<think>" not in result


# --- Truncation ---

def test_truncate_short():
    assert _truncate("short", 100) == "short"

def test_truncate_long():
    text = "a" * 5000
    result = _truncate(text, 100)
    assert len(result) < 200
    assert "truncated" in result
