# Fine-Tuning

Source: `src/renderer/src/components/EngineInterface.tsx`

## Overview

LoRA and QLoRA fine-tuning using Apple's MLX framework. Runs entirely on-device using unified memory. No GPU rental or cloud services required.

## Presets

Three built-in configurations:

| Preset | Epochs | Learning Rate | Batch | LoRA Rank | Use Case |
|--------|--------|---------------|-------|-----------|----------|
| Draft | 1 | 1e-5 | 2 | 4 | Quick test runs |
| Balanced | 3 | 2e-5 | 4 | 8 | General fine-tuning |
| Deep | 10 | 1e-5 | 2 | 16 | Maximum quality |

All parameters can be overridden manually.

## Hyperparameters

### Training

| Parameter | Range | Description |
|-----------|-------|-------------|
| Epochs | 1-50 | Number of passes over the dataset |
| Learning Rate | 1e-6 to 1e-3 | Step size for weight updates |
| Batch Size | 1-32 | Samples per training step |
| Warmup Steps | 0-1000 | Linear warmup before full learning rate |
| Weight Decay | 0-0.5 | L2 regularization strength |
| Gradient Checkpointing | on/off | Trade compute for memory |
| Max Sequence Length | 128-8192 | Maximum token length per sample |

### LoRA

| Parameter | Range | Description |
|-----------|-------|-------------|
| Rank | 2-64 | LoRA rank (lower = fewer parameters) |
| Alpha | 1-128 | Scaling factor for LoRA updates |
| Dropout | 0-0.5 | Dropout probability in LoRA layers |

## Dataset

The training dataset must be a JSONL file with `instruction`, `input` (optional), and `output` fields. Use the [Data Preparation](/features/data-preparation) page to convert CSV files.

Select the dataset file via the file picker. The UI shows a preview of the first few entries.

## Training Flow

1. Select a base model (must be loaded).
2. Choose a preset or configure manually.
3. Select a JSONL dataset.
4. Name the fine-tuning job.
5. Click "Start Training".
6. The backend spawns a training thread. Frontend polls job status every 2 seconds.
7. Loss curve and metrics are displayed in real-time.
8. On completion, the adapter is saved to `~/.silicon-studio/adapters/`.

## Post-Training

After training completes:

- The adapter is saved alongside the base model path.
- It appears in the Models list with `is_finetuned: true`.
- It can be exported via [Model Export](/features/model-export) at various quantization levels.

## Limitations

- One training job at a time.
- Training speed depends on model size and available unified memory.
- Very large models (30B+) may not fit in memory for fine-tuning on 16GB machines.

## Backend

Training is implemented in `backend/app/engine/service.py` using `mlx_lm.lora()`. The training config is written to a temporary YAML file and passed to the MLX training loop. Job status (loss, step, epoch) is tracked in memory and exposed via `GET /api/engine/jobs/{id}`.
