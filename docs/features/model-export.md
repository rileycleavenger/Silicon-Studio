# Model Export

Source: `src/renderer/src/components/ModelExport.tsx`

## Overview

Export fine-tuned LoRA adapters as standalone models. Fuses the adapter weights with the base model and optionally quantizes the result.

## Export Options

| Precision | q_bits | Description |
|-----------|--------|-------------|
| 4-bit | 4 | Smallest size, some quality loss |
| 8-bit | 8 | Balance of size and quality |
| Full precision | 0 | No quantization, largest size |

## Workflow

1. Open the Model Export page.
2. Select a fine-tuned adapter from the dropdown (only models with `is_finetuned: true`).
3. Choose a precision level.
4. Select an output directory via the file dialog.
5. Click Export.

The backend calls `mlx_lm.fuse()` to merge adapter weights into the base model. If quantization is selected (`q_bits > 0`), the fused model is also quantized.

## API

### List Adapters

`GET /api/engine/models/adapters` — returns models from the registry where `is_finetuned` is true.

### Export

`POST /api/engine/models/export`

```json
{
  "model_id": "adapter-uuid",
  "output_path": "/path/to/output",
  "q_bits": 4
}
```

## Backend

Implementation: `backend/app/engine/service.py` method `export_model()`.

```python
fuse_kwargs = {"model": base_model, "adapter_path": adapter_path, "save_path": output_path}
if q_bits and q_bits > 0:
    fuse_kwargs["q_bits"] = q_bits
mlx_lm.fuse(**fuse_kwargs)
```
