"""Parser for XML-style tool calls in model output."""

import re
from dataclasses import dataclass, field


@dataclass
class ParsedToolCall:
    name: str
    args: dict = field(default_factory=dict)
    raw: str = ""


# Match a complete <tool name="...">...</tool> block
_TOOL_RE = re.compile(
    r'<tool\s+name="([^"]+)">(.*?)</tool>',
    re.DOTALL,
)

# Match <arg name="...">...</arg> inside a tool block
_ARG_RE = re.compile(
    r'<arg\s+name="([^"]+)">(.*?)</arg>',
    re.DOTALL,
)

# Detect an incomplete tool tag (opened but not closed)
_PARTIAL_RE = re.compile(r'<tool\s+name="[^"]*">[^<]*$', re.DOTALL)


def extract_tool_calls(text: str) -> list[ParsedToolCall]:
    """Extract all complete tool calls from text.

    Returns a list of ParsedToolCall with name, args dict, and raw matched string.
    """
    results = []
    for match in _TOOL_RE.finditer(text):
        tool_name = match.group(1)
        body = match.group(2)
        args = {}
        for arg_match in _ARG_RE.finditer(body):
            arg_name = arg_match.group(1)
            arg_value = arg_match.group(2).strip()
            args[arg_name] = arg_value
        results.append(ParsedToolCall(name=tool_name, args=args, raw=match.group(0)))
    return results


def has_partial_tool_tag(text: str) -> bool:
    """Check if text ends with an incomplete tool tag (opened but not closed).

    Used to suppress streaming of partial XML to the frontend.
    """
    # Look at the last 500 chars to avoid scanning huge strings
    tail = text[-500:] if len(text) > 500 else text
    # Check if there's an opening <tool that hasn't been closed
    last_open = tail.rfind("<tool ")
    if last_open == -1:
        return False
    after_open = tail[last_open:]
    # If we find </tool> after the last <tool, it's complete
    if "</tool>" in after_open:
        return False
    return True


def strip_tool_calls(text: str) -> str:
    """Remove all complete tool call blocks from text, leaving surrounding prose."""
    return _TOOL_RE.sub("", text).strip()
