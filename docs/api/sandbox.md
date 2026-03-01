# Sandbox API

Prefix: `/api/sandbox`

Source: `backend/app/api/sandbox.py`

## Syntax Check

```
POST /api/sandbox/check
```

```json
{
  "code": "def foo():\n    return 42",
  "language": "python"
}
```

Validates syntax without executing. Supported languages: Python, JavaScript, TypeScript, Bash, Ruby, PHP, Perl, Swift.

Response:

```json
{
  "valid": true,
  "error": null,
  "language": "python"
}
```

## Run Code

```
POST /api/sandbox/run
```

```json
{
  "code": "print('hello')",
  "language": "python",
  "timeout": 10
}
```

Executes code in a subprocess. `timeout` is in seconds (default: 10).

Response:

```json
{
  "stdout": "hello\n",
  "stderr": "",
  "exit_code": 0,
  "timed_out": false,
  "run_id": "uuid"
}
```

Output is capped at 256KB. ANSI escape sequences are stripped.

## Kill Process

```
POST /api/sandbox/kill
```

```json
{ "run_id": "uuid" }
```

Terminates a running execution.
