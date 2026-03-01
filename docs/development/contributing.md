# Contributing

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally.
3. Follow the [Development Setup](/development/setup) guide.
4. Create a feature branch from `main`.

## Making Changes

- Run `npm run build` before committing to catch TypeScript errors.
- Run `pytest` in the backend to verify tests pass.
- Keep commits focused on a single change.
- Write clear commit messages describing what changed and why.

## Pull Requests

- Open PRs against the `main` branch.
- Describe the change, what it affects, and how to test it.
- Include screenshots for UI changes.

## Code Style

### Frontend

- TypeScript strict mode. The build fails on type errors.
- TailwindCSS for all styling. No CSS modules or inline style objects.
- React functional components with hooks.
- State management via React Context (no Redux or Zustand).
- API calls go through `src/renderer/src/api/client.ts`, not direct fetch.

### Backend

- Python type hints on all function signatures.
- FastAPI with Pydantic models for request/response validation.
- Async endpoints where possible.
- Logging via Python's `logging` module (no print statements).
- Format with `black` and `isort`.

## Areas for Contribution

Known gaps and improvement opportunities:

| Area | Current State | Improvement |
|------|--------------|-------------|
| RAG search | Keyword overlap | Vector embeddings with ONNX or MLX |
| Agent execution | Mocked | Real LLM inference and MCP tool binding |
| MCP in chat | Not integrated | Allow model to call MCP tools during inference |
| Toast notifications | Uses `alert()` | In-app toast component |
| SSE parsing | Duplicated 8 times | Shared utility function |
| Type safety | 9 `useState<any>` | Replace with proper types |
| Tests | Minimal | Expand backend test coverage |

## License

Contributions are accepted under the MIT license. By submitting a PR, you agree to license your contribution under the same terms.
