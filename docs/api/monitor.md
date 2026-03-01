# Monitor API

Prefix: `/api/monitor`

Source: `backend/app/api/monitor.py`

## System Stats

```
GET /api/monitor/stats
```

Returns current system resource usage. Polled by the frontend every 5 seconds for the top bar display.

Response:

```json
{
  "memory": {
    "total": 17179869184,
    "available": 8589934592,
    "used": 8589934592,
    "percent": 50.0
  },
  "cpu": {
    "percent": 25.0,
    "count": 10
  },
  "disk": {
    "total": 1000000000000,
    "used": 500000000000,
    "free": 500000000000,
    "percent": 50.0
  },
  "platform": {
    "system": "Darwin",
    "release": "24.0.0",
    "processor": "arm",
    "python_version": "3.11.5"
  }
}
```

Memory values are in bytes. CPU percent is system-wide. The frontend converts memory to GB for display.
