"""Local embedding service using ONNX Runtime + all-MiniLM-L6-v2.

Lazy-loaded: the model (~80MB) is downloaded on first use via huggingface_hub
and cached in the default HF cache directory.
"""

import logging
import numpy as np
from typing import List

logger = logging.getLogger(__name__)

MODEL_REPO = "sentence-transformers/all-MiniLM-L6-v2"
MAX_SEQ_LEN = 256


class LocalEmbedder:
    """Lightweight sentence embedder backed by ONNX Runtime."""

    def __init__(self):
        self._session = None
        self._tokenizer = None

    def _ensure_loaded(self):
        if self._session is not None:
            return

        from huggingface_hub import hf_hub_download
        import onnxruntime as ort
        from tokenizers import Tokenizer

        logger.info("Loading embedding model %s (ONNX)...", MODEL_REPO)

        model_path = hf_hub_download(repo_id=MODEL_REPO, filename="onnx/model.onnx")
        tokenizer_path = hf_hub_download(repo_id=MODEL_REPO, filename="tokenizer.json")

        self._session = ort.InferenceSession(
            model_path,
            providers=["CoreMLExecutionProvider", "CPUExecutionProvider"],
        )
        self._tokenizer = Tokenizer.from_file(tokenizer_path)
        self._tokenizer.enable_truncation(max_length=MAX_SEQ_LEN)
        self._tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")

        logger.info("Embedding model loaded.")

    @property
    def available(self) -> bool:
        """Check if ONNX runtime + tokenizers are importable."""
        try:
            import onnxruntime  # noqa: F401
            import tokenizers  # noqa: F401
            return True
        except ImportError:
            return False

    def embed(self, texts: List[str], batch_size: int = 64) -> np.ndarray:
        """Embed a list of texts into L2-normalized vectors.

        Returns ndarray of shape (len(texts), 384).
        """
        self._ensure_loaded()

        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            encodings = self._tokenizer.encode_batch(batch)

            input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
            attention_mask = np.array(
                [e.attention_mask for e in encodings], dtype=np.int64
            )
            token_type_ids = np.zeros_like(input_ids)

            outputs = self._session.run(
                None,
                {
                    "input_ids": input_ids,
                    "attention_mask": attention_mask,
                    "token_type_ids": token_type_ids,
                },
            )

            # Mean pooling over token embeddings
            token_embs = outputs[0]  # (batch, seq_len, hidden_dim)
            mask = attention_mask[:, :, np.newaxis].astype(np.float32)
            summed = np.sum(token_embs * mask, axis=1)
            counts = np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)
            embs = summed / counts

            # L2 normalize
            norms = np.linalg.norm(embs, axis=1, keepdims=True)
            embs = embs / np.clip(norms, 1e-9, None)

            all_embeddings.append(embs)

        return np.vstack(all_embeddings) if all_embeddings else np.empty((0, 384))

    def similarity(
        self, query_emb: np.ndarray, chunk_embs: np.ndarray
    ) -> np.ndarray:
        """Cosine similarity between a query vector and chunk vectors.

        Both are assumed L2-normalized (from embed()).
        Returns 1-D array of shape (len(chunk_embs),).
        """
        return (chunk_embs @ query_emb.T).flatten()


# Module-level singleton — lazy, no import cost
embedder = LocalEmbedder()
