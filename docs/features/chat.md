# Chat

Source: `src/renderer/src/components/ChatInterface.tsx`

## Overview

Local inference chat interface. Requires a loaded model. All processing happens on-device via MLX.

## Conversations

- Conversations are persisted to `~/.silicon-studio/conversations/` as JSON files.
- Each conversation has a title, message array, model ID, pin status, and timestamps.
- The conversation list is in the left sidebar under Chat, with search, rename, pin, and delete.
- Creating a new conversation: click the `+` button or start typing in an empty chat.

## Message Flow

1. User submits a message via the input bar or by pressing Enter.
2. Frontend calls `POST /api/engine/chat` with the model ID, message history, and parameters.
3. The backend streams tokens via Server-Sent Events (SSE).
4. Frontend renders tokens as they arrive, with markdown formatting (GFM, breaks, syntax highlighting).
5. On stream completion, the conversation is auto-saved.

## Parameters Sidebar

Collapsible right panel, collapsed by default. Stores overrides per-session (not persisted). Toggle with the "Parameters" button in the header or the chevron at the sidebar edge.

Available controls:

- Temperature, Max Tokens, Top-P, Repetition Penalty (sliders with numeric input)
- Reasoning mode: Off / Auto / Low / High
- Translate language selector
- Toggles: Show Prompt, Syntax Check, Auto-fix, Memory Map, PII Redaction, RAG, Web Search
- Visible quick actions selector
- System prompt textarea

## Quick Actions

Actions appear below each AI response. Each can be toggled on/off in the parameters sidebar.

| Action | Behavior |
|--------|----------|
| Longer / Shorter | Regenerate response with length instruction |
| Formal / Casual / Technical | Rewrite in specified tone |
| Translate | Translate to the configured language |
| Devil's Advocate | Argue the opposite position |
| CEO / ELI8 / Scientist / Poet | Rewrite from a perspective |
| Improve / Secure / Faster | Code-specific rewrites |
| Docs / Tests | Generate documentation or tests for code |
| Self-Critique | Iterative critique-then-improve loop (iterations auto-determined by context window size) |
| Ethical | Self-assessment with privacy, fairness, safety, transparency, ethics, and reliability scores |

Actions that rewrite responses skip RAG and web search to avoid polluting the prompt.

## In-Chat Search

Activated with `Ctrl+F` (or `Cmd+F`) or the Search button. Case-insensitive text search across all messages in the current conversation.

- Match count displayed as `N/M`
- Navigate with up/down arrow buttons or Enter/Shift+Enter
- Active match highlighted with yellow ring, other matches have subtle tint
- Escape to close

## Conversation Branching

Click the branch icon on any message to fork the conversation at that point. Creates a new conversation with messages up to (but not including) the selected message.

## Syntax Checking

When enabled, code blocks in AI responses are automatically validated after generation. Supported languages: Python, JavaScript, TypeScript, Bash, Ruby, PHP, Perl, Swift. Invalid code shows an inline error badge. With Auto-fix enabled, a "Fix" button appears that sends the code to the model for correction.

## Sandbox Execution

Code blocks include a "Run" button that executes code in an isolated subprocess via `POST /api/sandbox/run`. Output and errors are displayed inline. Maximum execution time is configurable (default: 10 seconds). Output is capped at 256KB.

## Memory Map

When enabled, the system auto-summarizes conversation context every N messages (configurable, default 5). The summary is injected as additional context to help the model maintain coherence in long conversations. Toggle the Memory panel to view the current summary.

## RAG Integration

Enable RAG in the parameters sidebar, select a collection. On each message, the system queries the collection for relevant chunks and injects them into the system prompt as context. See [RAG Knowledge](/features/rag) for collection management.

## Web Search

Enable Web Search in the parameters sidebar. On each message, the system runs a DuckDuckGo search with the user's query and injects the top results as context. Skipped for quick actions (Longer, Shorter, etc.).

## PII Redaction

When enabled, user messages are scanned for personally identifiable information (emails, phone numbers, IPs, credit card numbers) using Presidio. Detected PII is replaced with tokens before sending to the model.
