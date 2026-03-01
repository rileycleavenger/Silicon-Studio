# Engine / Models API

Prefix: `/api/engine`

Source: `backend/app/api/engine.py`

## Models

### List Models

```
GET /api/engine/models
```

Returns all registered models with download status, paths, and metadata.

### Download Model

```
POST /api/engine/models/download
```

```json
{ "model_id": "mlx-community/Qwen3-1.7B-MLX-8bit" }
```

Downloads model files from Hugging Face. Runs in background.

### Delete Model

```
POST /api/engine/models/delete
```

```json
{ "model_id": "model-uuid" }
```

Removes model files from disk.

### Register Custom Model

```
POST /api/engine/models/register
```

```json
{
  "name": "My Model",
  "path": "/absolute/path/to/model",
  "url": "https://huggingface.co/..."
}
```

### Scan Directory

```
POST /api/engine/models/scan
```

```json
{ "path": "/path/to/models/directory" }
```

Auto-discovers and registers all valid MLX models in the directory.

### Load Model

```
POST /api/engine/models/load
```

```json
{ "model_id": "model-uuid" }
```

Loads model into MLX memory. Returns `context_window` and `architecture` if available. Only one model can be loaded at a time.

### Unload Model

```
POST /api/engine/models/unload
```

Frees model from memory.

### List Adapters

```
GET /api/engine/models/adapters
```

Returns models where `is_finetuned` is true.

### Export Model

```
POST /api/engine/models/export
```

```json
{
  "model_id": "adapter-uuid",
  "output_path": "/path/to/output",
  "q_bits": 4
}
```

`q_bits`: 0 = full precision, 4 = 4-bit, 8 = 8-bit. Range: 0-16.

## Fine-Tuning

### Start Fine-Tuning

```
POST /api/engine/finetune
```

```json
{
  "model_id": "model-uuid",
  "dataset_path": "/path/to/data.jsonl",
  "job_name": "my-finetune",
  "epochs": 3,
  "learning_rate": 2e-5,
  "batch_size": 4,
  "lora_rank": 8,
  "lora_alpha": 16,
  "lora_dropout": 0.05,
  "warmup_steps": 50,
  "weight_decay": 0.01,
  "max_seq_length": 2048,
  "gradient_checkpointing": false
}
```

Returns `{ "job_id": "...", "status": "running" }`.

### Get Job Status

```
GET /api/engine/jobs/{job_id}
```

Returns current training state: step, epoch, loss, metrics, completion status.
