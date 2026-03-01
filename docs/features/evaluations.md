# Model Evaluations

Source: `src/renderer/src/components/Evaluations.tsx`

## Overview

Run standard benchmarks against loaded models to measure quality. Results are displayed with scores and stored for comparison.

## Available Benchmarks

| Benchmark | Measures |
|-----------|----------|
| MMLU | Multitask language understanding across 57 subjects |
| HellaSwag | Common-sense natural language inference |
| HumanEval | Python code generation correctness |
| TruthfulQA | Tendency to generate truthful answers |

## Workflow

1. Select a benchmark from the list.
2. Configure sample count (how many questions to evaluate).
3. Click "Run Evaluation".
4. Progress is displayed as each sample is processed.
5. Results show the score (percentage correct) and per-sample details.

## Evaluation History

Past evaluation results are stored and displayed in a history table, allowing comparison across models and fine-tuning iterations.

## Limitations

- Evaluations run on the currently loaded model only.
- Large benchmarks with many samples can be slow on smaller machines.
- Benchmark implementations may not match reference implementations exactly.
